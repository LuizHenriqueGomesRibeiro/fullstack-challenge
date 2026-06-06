import { afterAll, describe, expect, it } from "bun:test";
import type {
  BetDto,
  CashoutResultDto,
  PlaceBetResultDto,
  RoundDto,
  WalletDto,
} from "@crash/contracts";
import { resolve } from "node:path";
import { Pool } from "pg";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:8000";
const keycloakUrl =
  process.env.E2E_OIDC_ISSUER ??
  "http://localhost:8080/realms/crash-game";
const clientId = process.env.E2E_OIDC_CLIENT_ID ?? "crash-game-client";
const walletsDatabaseUrl =
  process.env.E2E_WALLETS_DATABASE_URL ??
  "postgresql://admin:admin@localhost:5432/wallets";
const walletPool = new Pool({ connectionString: walletsDatabaseUrl });

afterAll(async () => {
  await walletPool.end();
});

describe("Crash gameplay e2e", () => {
  it("rejects authenticated endpoints without a JWT", async () => {
    const walletResponse = await fetch(`${apiBaseUrl}/wallets/me`);
    expect(walletResponse.status).toBe(401);

    const betResponse = await fetch(`${apiBaseUrl}/games/bet`, {
      body: JSON.stringify({ amountCents: 100 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(betResponse.status).toBe(401);
  }, 20_000);

  it("rejects bets during an active round", async () => {
    const player = await login("player", "player123");

    await ensureWallet(player);
    await setWalletBalance(player.playerId, 100_000);

    let runningRound: RoundDto | null = null;
    let previousRoundId: string | undefined;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const bettingRound = await waitForBettingRound(previousRoundId);
      previousRoundId = bettingRound.id;
      runningRound = await waitForRunningRound(bettingRound.id);

      if (runningRound) {
        break;
      }
    }

    expect(runningRound).not.toBeNull();

    const response = await requestJson<{ code?: string; message?: string }>(
      "/games/bet",
      {
        body: JSON.stringify({ amountCents: 1_000 }),
        headers: authJsonHeaders(player.accessToken),
        method: "POST",
      },
    );

    expect(response.response.status).toBe(409);
    expect(response.body.code).toBe("ROUND_BETTING_CLOSED");
  }, 120_000);

  it("covers bet -> cashout, bet -> crash, duplicate bet and insufficient funds", async () => {
    const player = await login("player", "player123");
    const ranger = await login("ranger", "ranger123");

    await ensureWallet(player);
    await ensureWallet(ranger);
    await setWalletBalance(player.playerId, 100_000);
    await setWalletBalance(ranger.playerId, 100_000);

    const cashout = await completeCashoutFlow(player);
    expect(cashout.bet.status).toBe("cashed_out");
    expect(cashout.wallet?.balanceCents).toBeGreaterThan(99_000);

    const crashRound = await waitForBettingRound(cashout.bet.roundId);
    const crashBet = await placeBet(ranger, 1_000);
    expect(crashBet.bet.roundId).toBe(crashRound.id);

    const lostBet = await waitForBetStatus(ranger, crashRound.id, "lost");
    expect(lostBet.amountCents).toBe(1_000);

    await setWalletBalance(player.playerId, 0);
    await waitForBettingRound(crashRound.id);

    const insufficient = await requestJson<{ code?: string; message?: string }>(
      "/games/bet",
      {
        body: JSON.stringify({ amountCents: 100 }),
        headers: authJsonHeaders(player.accessToken),
        method: "POST",
      },
    );

    expect(insufficient.response.status).toBe(409);
    expect(insufficient.body.code).toBe("WALLET_INSUFFICIENT_FUNDS");
  }, 140_000);
});

async function completeCashoutFlow(
  player: TestIdentity,
): Promise<CashoutResultDto> {
  let duplicateChecked = false;
  let previousRoundId: string | undefined;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const round = await waitForBettingRound(previousRoundId);
    previousRoundId = round.id;

    const bet = await placeBet(player, 1_000);
    expect(bet.bet.roundId).toBe(round.id);
    expect(bet.bet.status).toBe("reserved");

    if (!duplicateChecked) {
      const duplicate = await requestJson("/games/bet", {
        body: JSON.stringify({ amountCents: 1_000 }),
        headers: authJsonHeaders(player.accessToken),
        method: "POST",
      });
      expect(duplicate.response.status).toBe(409);
      duplicateChecked = true;
    }

    const runningRound = await waitForRunningRound(round.id);
    if (!runningRound) {
      await waitForBetStatus(player, round.id, "lost");
      continue;
    }

    const cashout = await requestJson<CashoutResultDto>(
      "/games/bet/cashout",
      {
        body: JSON.stringify({}),
        headers: authJsonHeaders(player.accessToken),
        method: "POST",
      },
    );

    if (cashout.response.ok) {
      return cashout.body;
    }

    await waitForBetStatus(player, round.id, "lost");
  }

  throw new Error("Unable to complete a cashout flow before an instant crash.");
}

async function placeBet(
  identity: TestIdentity,
  amountCents: number,
): Promise<PlaceBetResultDto> {
  const response = await requestJson<PlaceBetResultDto>("/games/bet", {
    body: JSON.stringify({ amountCents }),
    headers: authJsonHeaders(identity.accessToken),
    method: "POST",
  });

  expect(response.response.status).toBe(201);
  return response.body;
}

async function ensureWallet(identity: TestIdentity): Promise<WalletDto> {
  const response = await requestJson<WalletDto>("/wallets", {
    body: JSON.stringify({ username: identity.username }),
    headers: authJsonHeaders(identity.accessToken),
    method: "POST",
  });

  expect(response.response.status).toBe(201);
  return response.body;
}

async function setWalletBalance(
  playerId: string,
  balanceCents: number,
): Promise<void> {
  try {
    await walletPool.query(
      `
        UPDATE wallets
        SET balance_cents = $2, updated_at = now()
        WHERE player_id = $1
      `,
      [playerId, balanceCents],
    );
  } catch {
    await setWalletBalanceWithDocker(playerId, balanceCents);
  }
}

async function setWalletBalanceWithDocker(
  playerId: string,
  balanceCents: number,
): Promise<void> {
  const sql = `
    UPDATE wallets
    SET balance_cents = ${balanceCents}, updated_at = now()
    WHERE player_id = '${escapeSql(playerId)}'
  `;
  const child = Bun.spawn(
    [
      "docker",
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "admin",
      "-d",
      "wallets",
      "-c",
      sql,
    ],
    {
      cwd: resolve(process.cwd(), "../.."),
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    const errorText = await new Response(child.stderr).text();
    throw new Error(errorText);
  }
}

async function waitForBettingRound(
  previousRoundId?: string,
): Promise<RoundDto> {
  return waitFor(async () => {
    const round = await getCurrentRound();

    if (round.phase === "betting" && round.id !== previousRoundId) {
      return round;
    }

    return null;
  }, 60_000);
}

async function waitForRunningRound(roundId: string): Promise<RoundDto | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 35_000) {
    const round = await getCurrentRound();

    if (round.id !== roundId) {
      return null;
    }

    if (round.phase === "running") {
      return round;
    }

    if (round.phase !== "betting") {
      return null;
    }

    await sleep(50);
  }

  return null;
}

async function waitForBetStatus(
  identity: TestIdentity,
  roundId: string,
  status: BetDto["status"],
): Promise<BetDto> {
  return waitFor(async () => {
    const bets = await requestJson<BetDto[]>("/games/bets/me", {
      headers: authHeaders(identity.accessToken),
      method: "GET",
    });
    const bet = bets.body.find((candidate) => candidate.roundId === roundId);

    return bet?.status === status ? bet : null;
  }, 45_000);
}

async function getCurrentRound(): Promise<RoundDto> {
  const response = await requestJson<RoundDto>("/games/rounds/current", {
    method: "GET",
  });

  expect(response.response.status).toBe(200);
  return response.body;
}

async function waitFor<TResult>(
  operation: () => Promise<TResult | null>,
  timeoutMs: number,
): Promise<TResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await operation();

    if (result) {
      return result;
    }

    await sleep(250);
  }

  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}

async function login(
  username: string,
  password: string,
): Promise<TestIdentity> {
  const response = await fetch(`${keycloakUrl}/protocol/openid-connect/token`, {
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "password",
      password,
      username,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`OIDC login failed with ${response.status}.`);
  }

  const body = (await response.json()) as { access_token: string };
  const claims = parseJwtClaims(body.access_token);

  return {
    accessToken: body.access_token,
    playerId: claims.sub,
    username: claims.preferred_username ?? username,
  };
}

async function requestJson<TBody = unknown>(
  path: string,
  init: RequestInit,
): Promise<{ body: TBody; response: Response }> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = (await safeJson(response)) as TBody;
  return { body, response };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function authJsonHeaders(accessToken: string): Record<string, string> {
  return {
    ...authHeaders(accessToken),
    "Content-Type": "application/json",
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function parseJwtClaims(token: string): {
  preferred_username?: string;
  sub: string;
} {
  const [, payload] = token.split(".");

  if (!payload) {
    throw new Error("JWT payload is missing.");
  }

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    preferred_username?: string;
    sub: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

interface TestIdentity {
  accessToken: string;
  playerId: string;
  username: string;
}

import { describe, expect, it } from "bun:test";
import type { WalletDto } from "@crash/contracts";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:8000";
const keycloakUrl =
  process.env.E2E_OIDC_ISSUER ??
  "http://localhost:8080/realms/crash-game";
const clientId = process.env.E2E_OIDC_CLIENT_ID ?? "crash-game-client";

describe("Wallet auth e2e", () => {
  it("requires a valid JWT for the authenticated wallet routes", async () => {
    const anonymous = await fetch(`${apiBaseUrl}/wallets/me`);
    expect(anonymous.status).toBe(401);

    const identity = await login("player", "player123");
    const created = await requestJson<WalletDto>("/wallets", {
      body: JSON.stringify({ username: identity.username }),
      headers: authJsonHeaders(identity.accessToken),
      method: "POST",
    });

    expect(created.response.status).toBe(201);
    expect(created.body.playerId).toBe(identity.playerId);

    const me = await requestJson<WalletDto>("/wallets/me", {
      headers: authHeaders(identity.accessToken),
      method: "GET",
    });

    expect(me.response.status).toBe(200);
    expect(me.body.playerId).toBe(identity.playerId);
  });
});

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

async function requestJson<TBody>(
  path: string,
  init: RequestInit,
): Promise<{ body: TBody; response: Response }> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = (await response.json()) as TBody;
  return { body, response };
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

interface TestIdentity {
  accessToken: string;
  playerId: string;
  username: string;
}

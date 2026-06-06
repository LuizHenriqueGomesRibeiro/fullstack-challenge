import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CURRENCY,
  payoutForMultiplier,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
} from "@crash/contracts";
import { Subject } from "rxjs";
import { GameEngineState } from "../../src/application/game-engine.state";
import { CashoutUseCase } from "../../src/application/use-cases/cashout.use-case";
import { CrashRoundUseCase } from "../../src/application/use-cases/crash-round.use-case";
import { CreateRoundUseCase } from "../../src/application/use-cases/create-round.use-case";
import { ExecuteWalletCommandUseCase } from "../../src/application/use-cases/execute-wallet-command.use-case";
import { PlaceBetUseCase } from "../../src/application/use-cases/place-bet.use-case";
import { RejectBetUseCase } from "../../src/application/use-cases/reject-bet.use-case";
import { RoundLifecycleUseCase } from "../../src/application/use-cases/round-lifecycle.use-case";
import { StartRoundUseCase } from "../../src/application/use-cases/start-round.use-case";
import { TickRoundUseCase } from "../../src/application/use-cases/tick-round.use-case";
import { InMemoryGameRepository } from "../../src/infrastructure/game.repository";
import type { WalletsEventsClient } from "../../src/infrastructure/wallets-events.client";

describe("Bet logic", () => {
  it("validates amounts, blocks duplicate bets and closes betting while the round is running", async () => {
    const harness = createHarness();
    const round = await harness.createRound.execute();
    harness.state.currentRound = round;

    await expect(
      harness.placeBet.execute({ amountCents: 99 }, "player-1", "neo"),
    ).rejects.toMatchObject({ code: "BET_AMOUNT_INVALID" });

    await expect(
      harness.placeBet.execute({ amountCents: 100_001 }, "player-1", "neo"),
    ).rejects.toMatchObject({ code: "BET_AMOUNT_INVALID" });

    const firstBet = await harness.placeBet.execute(
      { amountCents: 1_000, username: "Neo" },
      "player-1",
      "neo",
    );

    expect(firstBet.bet.status).toBe("reserved");
    expect(round.bets).toHaveLength(1);

    await expect(
      harness.placeBet.execute({ amountCents: 1_000 }, "player-1", "neo"),
    ).rejects.toMatchObject({ code: "BET_ALREADY_PLACED" });

    await harness.startRound.execute();

    await expect(
      harness.placeBet.execute({ amountCents: 1_000 }, "player-2", "trinity"),
    ).rejects.toMatchObject({ code: "ROUND_BETTING_CLOSED" });

    expect(harness.walletClient.commands).toHaveLength(1);
  });

  it("rejects a bet and marks it as rejected when the wallet cannot debit it", async () => {
    const harness = createHarness(500);
    const round = await harness.createRound.execute();
    harness.state.currentRound = round;

    await expect(
      harness.placeBet.execute({ amountCents: 1_000 }, "player-3", "morpheus"),
    ).rejects.toMatchObject({ code: "WALLET_INSUFFICIENT_FUNDS" });

    expect(round.bets).toHaveLength(1);
    expect(round.bets[0].status).toBe("rejected");
    expect(harness.walletClient.commands).toHaveLength(1);
  });

  it("cashes out reserved bets with an exact cent payout", async () => {
    const harness = createHarness();
    const round = await harness.createRound.execute();
    round.crashPointBp = 2_000;
    harness.state.currentRound = round;

    const bet = await harness.placeBet.execute(
      { amountCents: 1_000 },
      "player-4",
      "apoc",
    );

    expect(bet.bet.status).toBe("reserved");

    await harness.startRound.execute();

    const fixedNow = Date.now();
    const originalNow = Date.now;
    Date.now = () => fixedNow;
    try {
      round.startedAt = new Date(fixedNow - 300).toISOString();
      const result = await harness.cashout.execute("player-4");
      const expectedPayout = payoutForMultiplier(1_000, 175);

      expect(result.bet.status).toBe("cashed_out");
      expect(result.bet.cashoutMultiplierBp).toBe(175);
      expect(result.bet.payoutCents).toBe(expectedPayout);
      expect(result.wallet?.balanceCents).toBe(100_000 - 1_000 + expectedPayout);
      expect(harness.walletClient.commands).toHaveLength(2);
      expect(harness.walletClient.commands[1].type).toBe("credit");
      expect(harness.walletClient.commands[1].reason).toBe("cashout_payout");
      expect(round.bets[0].status).toBe("cashed_out");
    } finally {
      Date.now = originalNow;
    }
  });
});

function createHarness(initialBalanceCents = 100_000) {
  const state = new GameEngineState();
  const repository = new InMemoryGameRepository();
  const walletClient = createWalletClient(initialBalanceCents);
  const executeWalletCommand = new ExecuteWalletCommandUseCase(walletClient.client);
  const rejectBet = new RejectBetUseCase(state, repository);
  const createRound = new CreateRoundUseCase(state, repository);
  const crashRound = new CrashRoundUseCase(state, repository);
  const startRound = new StartRoundUseCase(state, repository);
  const tickRound = new TickRoundUseCase(state);
  const roundLifecycle = new RoundLifecycleUseCase(
    state,
    createRound,
    crashRound,
    startRound,
    tickRound,
    repository,
  );
  const placeBet = new PlaceBetUseCase(
    state,
    executeWalletCommand,
    rejectBet,
    repository,
  );
  const cashout = new CashoutUseCase(
    state,
    executeWalletCommand,
    roundLifecycle,
    repository,
  );

  return {
    cashout,
    createRound,
    placeBet,
    repository,
    roundLifecycle,
    startRound,
    state,
    walletClient,
  };
}

function createWalletClient(initialBalanceCents = 100_000) {
  let balanceCents = initialBalanceCents;
  const commands: WalletCommandDto[] = [];
  const outcomes = new Subject<WalletCommandOutcomeDto>();

  return {
    client: {
      outcomes$: outcomes.asObservable(),
      executeCommand: async (
        command: WalletCommandDto,
      ): Promise<WalletCommandOutcomeDto> => {
        commands.push(command);
        const nextBalanceCents =
          command.type === "debit"
            ? balanceCents - command.amountCents
            : balanceCents + command.amountCents;

        if (nextBalanceCents < 0) {
          return {
            accepted: false,
            idempotent: false,
            idempotencyKey: command.idempotencyKey,
            playerId: command.playerId,
            rejectionCode: "WALLET_INSUFFICIENT_FUNDS",
            rejectionMessage: "Wallet balance is not enough for this debit.",
            correlationId: command.correlationId,
            metadata: command.metadata ?? {},
            occurredAt: new Date(0).toISOString(),
          };
        }

        balanceCents = nextBalanceCents;
        const now = new Date(0).toISOString();

        return {
          accepted: true,
          idempotent: false,
          wallet: {
            playerId: command.playerId,
            username: command.username ?? command.playerId,
            balanceCents,
            currency: DEFAULT_CURRENCY,
            createdAt: now,
            updatedAt: now,
          },
          ledgerEntry: {
            id: command.idempotencyKey,
            idempotencyKey: command.idempotencyKey,
            playerId: command.playerId,
            type: command.type,
            reason: command.reason,
            amountCents: command.amountCents,
            balanceAfterCents: balanceCents,
            correlationId: command.correlationId,
            metadata: command.metadata ?? {},
            createdAt: now,
          },
        };
      },
    } as WalletsEventsClient,
    commands,
    get balanceCents() {
      return balanceCents;
    },
  };
}

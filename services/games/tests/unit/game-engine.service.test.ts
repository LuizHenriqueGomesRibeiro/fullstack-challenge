import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CURRENCY,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
  type WalletCommandResultDto,
} from "@crash/contracts";
import { GameEngineService } from "../../src/application/game-engine.service";
import { GameEngineState } from "../../src/application/game-engine.state";
import { ApplyWalletOutcomeUseCase } from "../../src/application/use-cases/apply-wallet-outcome.use-case";
import { CashoutUseCase } from "../../src/application/use-cases/cashout.use-case";
import { CrashRoundUseCase } from "../../src/application/use-cases/crash-round.use-case";
import { CreateRoundUseCase } from "../../src/application/use-cases/create-round.use-case";
import { ExecuteWalletCommandUseCase } from "../../src/application/use-cases/execute-wallet-command.use-case";
import { GetBetHistoryUseCase } from "../../src/application/use-cases/get-bet-history.use-case";
import { PlaceBetUseCase } from "../../src/application/use-cases/place-bet.use-case";
import { RejectBetUseCase } from "../../src/application/use-cases/reject-bet.use-case";
import { RoundLifecycleUseCase } from "../../src/application/use-cases/round-lifecycle.use-case";
import { StartRoundUseCase } from "../../src/application/use-cases/start-round.use-case";
import { TickRoundUseCase } from "../../src/application/use-cases/tick-round.use-case";
import { GameDomainError } from "../../src/domain/game.errors";
import { InMemoryGameRepository } from "../../src/infrastructure/game.repository";
import type { WalletsEventsClient } from "../../src/infrastructure/wallets-events.client";
import { Subject } from "rxjs";

describe("GameEngineService", () => {
  it("places one bet per player while betting is open", async () => {
    const walletClient = createWalletClient();
    const service = createGameEngineService(walletClient);
    await service.onModuleInit();

    try {
      const result = await service.placeBet(
        { amountCents: 1_000, username: "morpheus" },
        "p1",
        "morpheus",
      );

      expect(result.bet.status).toBe("reserved");
      expect(service.getCurrentRound().bets).toHaveLength(1);

      await expect(
        service.placeBet({ amountCents: 1_000 }, "p1", "morpheus"),
      ).rejects.toThrow(GameDomainError);
    } finally {
      service.onModuleDestroy();
    }
  });
});

function createGameEngineService(walletClient: WalletsEventsClient): GameEngineService {
  const repository = new InMemoryGameRepository();
  const state = new GameEngineState();
  const executeWalletCommand = new ExecuteWalletCommandUseCase(walletClient);
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
  const getBetHistory = new GetBetHistoryUseCase(repository);
  const applyWalletOutcome = new ApplyWalletOutcomeUseCase(
    state,
    rejectBet,
    repository,
  );

  return new GameEngineService(
    walletClient,
    state,
    roundLifecycle,
    placeBet,
    cashout,
    getBetHistory,
    applyWalletOutcome,
  );
}

function createWalletClient(): WalletsEventsClient {
  let balanceCents = 100_000;
  const outcomes = new Subject<WalletCommandOutcomeDto>();

  return {
    outcomes$: outcomes.asObservable(),
    executeCommand: async (
      command: WalletCommandDto,
    ): Promise<WalletCommandResultDto> => {
      balanceCents =
        command.type === "debit"
          ? balanceCents - command.amountCents
          : balanceCents + command.amountCents;

      return {
        accepted: true,
        idempotent: false,
        wallet: {
          playerId: command.playerId,
          username: command.username ?? command.playerId,
          balanceCents,
          currency: DEFAULT_CURRENCY,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
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
          createdAt: new Date(0).toISOString(),
        },
      };
    },
  } as WalletsEventsClient;
}

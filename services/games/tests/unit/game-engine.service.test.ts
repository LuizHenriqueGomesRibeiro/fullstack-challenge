import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CURRENCY,
  type WalletCommandDto,
  type WalletCommandResultDto,
} from "@crash/contracts";
import { GameEngineService } from "../../src/application/game-engine.service";
import type { WalletsHttpClient } from "../../src/infrastructure/wallets-http.client";
import { GameDomainError } from "../../src/domain/game.errors";

describe("GameEngineService", () => {
  it("places one bet per player while betting is open", async () => {
    const walletClient = createWalletClient();
    const service = new GameEngineService(walletClient);

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

function createWalletClient(): WalletsHttpClient {
  let balanceCents = 100_000;

  return {
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
  } as WalletsHttpClient;
}

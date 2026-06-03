import { describe, expect, it } from "bun:test";
import { WalletsService } from "../../src/application/wallets.service";
import { WalletDomainError } from "../../src/domain/wallet.errors";
import { InMemoryWalletsRepository } from "../../src/infrastructure/wallets.repository";

describe("WalletsService", () => {
  it("debits and credits integer cents with idempotency", async () => {
    const service = createService();
    const wallet = await service.createWallet({ playerId: "p1", username: "neo" });

    const debit = await service.executeCommand({
      idempotencyKey: "bet:p1:1",
      playerId: wallet.playerId,
      type: "debit",
      reason: "bet_placed",
      amountCents: 1_000,
      correlationId: "bet-1",
    });

    expect(debit.wallet.balanceCents).toBe(wallet.balanceCents - 1_000);

    const repeatedDebit = await service.executeCommand({
      idempotencyKey: "bet:p1:1",
      playerId: wallet.playerId,
      type: "debit",
      reason: "bet_placed",
      amountCents: 1_000,
      correlationId: "bet-1",
    });

    expect(repeatedDebit.idempotent).toBe(true);
    expect(repeatedDebit.wallet.balanceCents).toBe(debit.wallet.balanceCents);

    const credit = await service.executeCommand({
      idempotencyKey: "cashout:p1:1",
      playerId: wallet.playerId,
      type: "credit",
      reason: "cashout_payout",
      amountCents: 1_750,
      correlationId: "bet-1",
    });

    expect(credit.wallet.balanceCents).toBe(debit.wallet.balanceCents + 1_750);
  });

  it("rejects debits that would make balance negative", async () => {
    const service = createService();
    await service.createWallet({ playerId: "p2", username: "trinity" });

    await expect(
      service.executeCommand({
        idempotencyKey: "bet:p2:too-big",
        playerId: "p2",
        type: "debit",
        reason: "bet_placed",
        amountCents: 9_999_999,
        correlationId: "bet-too-big",
      }),
    ).rejects.toThrow(WalletDomainError);
  });
});

function createService(): WalletsService {
  return new WalletsService(new InMemoryWalletsRepository());
}

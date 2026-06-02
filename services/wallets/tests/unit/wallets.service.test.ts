import { describe, expect, it } from "bun:test";
import { WalletsService } from "../../src/application/wallets.service";
import { WalletDomainError } from "../../src/domain/wallet.errors";

describe("WalletsService", () => {
  it("debits and credits integer cents with idempotency", () => {
    const service = new WalletsService();
    const wallet = service.createWallet({ playerId: "p1", username: "neo" });

    const debit = service.executeCommand({
      idempotencyKey: "bet:p1:1",
      playerId: wallet.playerId,
      type: "debit",
      reason: "bet_placed",
      amountCents: 1_000,
      correlationId: "bet-1",
    });

    expect(debit.wallet.balanceCents).toBe(wallet.balanceCents - 1_000);

    const repeatedDebit = service.executeCommand({
      idempotencyKey: "bet:p1:1",
      playerId: wallet.playerId,
      type: "debit",
      reason: "bet_placed",
      amountCents: 1_000,
      correlationId: "bet-1",
    });

    expect(repeatedDebit.idempotent).toBe(true);
    expect(repeatedDebit.wallet.balanceCents).toBe(debit.wallet.balanceCents);

    const credit = service.executeCommand({
      idempotencyKey: "cashout:p1:1",
      playerId: wallet.playerId,
      type: "credit",
      reason: "cashout_payout",
      amountCents: 1_750,
      correlationId: "bet-1",
    });

    expect(credit.wallet.balanceCents).toBe(debit.wallet.balanceCents + 1_750);
  });

  it("rejects debits that would make balance negative", () => {
    const service = new WalletsService();
    service.createWallet({ playerId: "p2", username: "trinity" });

    expect(() =>
      service.executeCommand({
        idempotencyKey: "bet:p2:too-big",
        playerId: "p2",
        type: "debit",
        reason: "bet_placed",
        amountCents: 9_999_999,
        correlationId: "bet-too-big",
      }),
    ).toThrow(WalletDomainError);
  });
});

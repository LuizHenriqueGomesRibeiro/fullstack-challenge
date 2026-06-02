import { Injectable } from "@nestjs/common";
import {
  DEFAULT_CURRENCY,
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  type CreateWalletRequestDto,
  type WalletCommandDto,
  type WalletCommandResultDto,
  type WalletDto,
  type WalletLedgerEntryDto,
  isPositiveInteger,
} from "@crash/contracts";
import { randomUUID } from "node:crypto";
import {
  insufficientFunds,
  invalidWalletAmount,
  walletNotFound,
} from "../domain/wallet.errors";

type WalletRecord = WalletDto;

@Injectable()
export class WalletsService {
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly ledgerByIdempotencyKey = new Map<
    string,
    WalletLedgerEntryDto
  >();
  private readonly defaultBalanceCents = readIntegerEnv(
    "DEFAULT_WALLET_BALANCE_CENTS",
    100_000,
  );

  constructor() {
    this.createWallet({
      playerId: DEFAULT_PLAYER_ID,
      username: DEFAULT_USERNAME,
    });
  }

  createWallet(request: CreateWalletRequestDto = {}): WalletDto {
    const now = new Date().toISOString();
    const playerId = normalizeId(request.playerId, DEFAULT_PLAYER_ID);
    const username = normalizeId(request.username, DEFAULT_USERNAME);
    const existing = this.wallets.get(playerId);

    if (existing) {
      existing.username = username;
      existing.updatedAt = now;
      return { ...existing };
    }

    const wallet: WalletRecord = {
      playerId,
      username,
      balanceCents: this.defaultBalanceCents,
      currency: DEFAULT_CURRENCY,
      createdAt: now,
      updatedAt: now,
    };

    this.wallets.set(playerId, wallet);
    this.recordLedgerEntry({
      idempotencyKey: `wallet-seed:${playerId}`,
      playerId,
      type: "credit",
      reason: "wallet_seed",
      amountCents: wallet.balanceCents,
      balanceAfterCents: wallet.balanceCents,
      correlationId: `wallet:${playerId}`,
      metadata: { source: "seed" },
      createdAt: now,
    });

    return { ...wallet };
  }

  getWallet(playerId = DEFAULT_PLAYER_ID): WalletDto {
    const wallet = this.wallets.get(normalizeId(playerId, DEFAULT_PLAYER_ID));

    if (!wallet) {
      throw walletNotFound(playerId);
    }

    return { ...wallet };
  }

  executeCommand(command: WalletCommandDto): WalletCommandResultDto {
    if (!isPositiveInteger(command.amountCents)) {
      throw invalidWalletAmount();
    }

    const previousEntry = this.ledgerByIdempotencyKey.get(
      command.idempotencyKey,
    );

    if (previousEntry) {
      return {
        accepted: true,
        idempotent: true,
        wallet: this.getWallet(previousEntry.playerId),
        ledgerEntry: { ...previousEntry },
      };
    }

    const now = new Date().toISOString();
    const playerId = normalizeId(command.playerId, DEFAULT_PLAYER_ID);
    const wallet = this.ensureWalletRecord(
      playerId,
      command.username ?? playerId,
    );

    const nextBalance =
      command.type === "debit"
        ? wallet.balanceCents - command.amountCents
        : wallet.balanceCents + command.amountCents;

    if (nextBalance < 0) {
      throw insufficientFunds();
    }

    wallet.balanceCents = nextBalance;
    wallet.updatedAt = now;

    const ledgerEntry = this.recordLedgerEntry({
      idempotencyKey: command.idempotencyKey,
      playerId,
      type: command.type,
      reason: command.reason,
      amountCents: command.amountCents,
      balanceAfterCents: wallet.balanceCents,
      correlationId: command.correlationId,
      metadata: command.metadata ?? {},
      createdAt: now,
    });

    return {
      accepted: true,
      idempotent: false,
      wallet: { ...wallet },
      ledgerEntry,
    };
  }

  listLedger(playerId?: string): WalletLedgerEntryDto[] {
    return Array.from(this.ledgerByIdempotencyKey.values())
      .filter((entry) => !playerId || entry.playerId === playerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((entry) => ({ ...entry }));
  }

  private recordLedgerEntry(
    entry: Omit<WalletLedgerEntryDto, "id">,
  ): WalletLedgerEntryDto {
    const ledgerEntry = {
      ...entry,
      id: randomUUID(),
    };

    this.ledgerByIdempotencyKey.set(entry.idempotencyKey, ledgerEntry);
    return { ...ledgerEntry };
  }

  private ensureWalletRecord(playerId: string, username: string): WalletRecord {
    const existing = this.wallets.get(playerId);

    if (existing) {
      return existing;
    }

    this.createWallet({ playerId, username });
    const wallet = this.wallets.get(playerId);

    if (!wallet) {
      throw walletNotFound(playerId);
    }

    return wallet;
  }
}

function normalizeId(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

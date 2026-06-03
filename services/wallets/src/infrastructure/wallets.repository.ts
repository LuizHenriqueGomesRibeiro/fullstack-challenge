import {
  DEFAULT_CURRENCY,
  type CreateWalletRequestDto,
  type EventMetadata,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
  type WalletCommandResultDto,
  type WalletDto,
  type WalletLedgerEntryDto,
} from "@crash/contracts";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { insufficientFunds, walletNotFound } from "../domain/wallet.errors";
import { PostgresService } from "./postgres.service";

export const WALLETS_REPOSITORY = Symbol("WALLETS_REPOSITORY");

export interface WalletOutboxMessage {
  id: string;
  routingKey: string;
  payload: WalletCommandOutcomeDto;
}

export interface WalletsRepository {
  migrate(): Promise<void>;
  createWallet(
    request: Required<CreateWalletRequestDto>,
    defaultBalanceCents: number,
  ): Promise<WalletDto>;
  findWallet(playerId: string): Promise<WalletDto | null>;
  executeCommand(
    command: WalletCommandDto,
    defaultBalanceCents: number,
  ): Promise<WalletCommandResultDto>;
  listLedger(playerId?: string): Promise<WalletLedgerEntryDto[]>;
  findInboxResult(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null>;
  saveInboxResult(
    idempotencyKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void>;
  enqueueOutbox(
    routingKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void>;
  listUnpublishedOutbox(limit: number): Promise<WalletOutboxMessage[]>;
  markOutboxPublished(id: string): Promise<void>;
}

interface WalletRow extends QueryResultRow {
  player_id: string;
  username: string;
  balance_cents: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

interface LedgerRow extends QueryResultRow {
  id: string;
  idempotency_key: string;
  player_id: string;
  type: WalletLedgerEntryDto["type"];
  reason: WalletLedgerEntryDto["reason"];
  amount_cents: string;
  balance_after_cents: string;
  correlation_id: string;
  metadata: EventMetadata;
  created_at: Date;
}

interface InboxRow extends QueryResultRow {
  result_payload: WalletCommandOutcomeDto | null;
}

interface OutboxRow extends QueryResultRow {
  id: string;
  routing_key: string;
  payload: WalletCommandOutcomeDto;
}

@Injectable()
export class PostgresWalletsRepository implements WalletsRepository {
  private migrationPromise?: Promise<void>;

  constructor(private readonly postgres: PostgresService) {}

  async migrate(): Promise<void> {
    this.migrationPromise ??= this.runMigrations();
    await this.migrationPromise;
  }

  private async runMigrations(): Promise<void> {
    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        player_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        balance_cents BIGINT NOT NULL CHECK (balance_cents >= 0),
        currency TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        player_id TEXT NOT NULL REFERENCES wallets(player_id),
        type TEXT NOT NULL,
        reason TEXT NOT NULL,
        amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
        balance_after_cents BIGINT NOT NULL CHECK (balance_after_cents >= 0),
        correlation_id TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS wallet_inbox (
        idempotency_key TEXT PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL,
        result_payload JSONB
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS wallet_outbox (
        id TEXT PRIMARY KEY,
        routing_key TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        published_at TIMESTAMPTZ
      )
    `);

    await this.postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_ledger_player_created
      ON wallet_ledger_entries(player_id, created_at DESC)
    `);

    await this.postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_outbox_unpublished
      ON wallet_outbox(created_at)
      WHERE published_at IS NULL
    `);
  }

  async createWallet(
    request: Required<CreateWalletRequestDto>,
    defaultBalanceCents: number,
  ): Promise<WalletDto> {
    return this.postgres.transaction(async (client) =>
      this.ensureWallet(client, request.playerId, request.username, defaultBalanceCents),
    );
  }

  async findWallet(playerId: string): Promise<WalletDto | null> {
    const result = await this.postgres.query<WalletRow>(
      "SELECT * FROM wallets WHERE player_id = $1",
      [playerId],
    );

    const row = result.rows[0];
    return row ? mapWallet(row) : null;
  }

  async executeCommand(
    command: WalletCommandDto,
    defaultBalanceCents: number,
  ): Promise<WalletCommandResultDto> {
    return this.postgres.transaction(async (client) => {
      const previousEntry = await this.findLedgerByIdempotencyKey(
        client,
        command.idempotencyKey,
      );

      if (previousEntry) {
        const wallet = await this.findWalletForUpdate(
          client,
          previousEntry.playerId,
        );

        if (!wallet) {
          throw walletNotFound(previousEntry.playerId);
        }

        return {
          accepted: true,
          idempotent: true,
          ledgerEntry: previousEntry,
          wallet,
        };
      }

      const now = new Date();
      const wallet = await this.ensureWallet(
        client,
        command.playerId,
        command.username ?? command.playerId,
        defaultBalanceCents,
      );
      const nextBalanceCents =
        command.type === "debit"
          ? wallet.balanceCents - command.amountCents
          : wallet.balanceCents + command.amountCents;

      if (nextBalanceCents < 0) {
        throw insufficientFunds();
      }

      await client.query(
        `
          UPDATE wallets
          SET balance_cents = $2, username = $3, updated_at = $4
          WHERE player_id = $1
        `,
        [
          command.playerId,
          nextBalanceCents,
          command.username ?? wallet.username,
          now,
        ],
      );

      const ledgerEntry = await this.insertLedger(client, {
        id: randomUUID(),
        idempotencyKey: command.idempotencyKey,
        playerId: command.playerId,
        type: command.type,
        reason: command.reason,
        amountCents: command.amountCents,
        balanceAfterCents: nextBalanceCents,
        correlationId: command.correlationId,
        metadata: command.metadata ?? {},
        createdAt: now.toISOString(),
      });

      return {
        accepted: true,
        idempotent: false,
        ledgerEntry,
        wallet: {
          ...wallet,
          username: command.username ?? wallet.username,
          balanceCents: nextBalanceCents,
          updatedAt: now.toISOString(),
        },
      };
    });
  }

  async listLedger(playerId?: string): Promise<WalletLedgerEntryDto[]> {
    const result = await this.postgres.query<LedgerRow>(
      `
        SELECT * FROM wallet_ledger_entries
        WHERE ($1::text IS NULL OR player_id = $1)
        ORDER BY created_at DESC
      `,
      [playerId ?? null],
    );

    return result.rows.map(mapLedgerEntry);
  }

  async findInboxResult(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null> {
    const result = await this.postgres.query<InboxRow>(
      "SELECT result_payload FROM wallet_inbox WHERE idempotency_key = $1",
      [idempotencyKey],
    );

    return result.rows[0]?.result_payload ?? null;
  }

  async saveInboxResult(
    idempotencyKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO wallet_inbox (idempotency_key, received_at, result_payload)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET result_payload = EXCLUDED.result_payload
      `,
      [idempotencyKey, new Date(), JSON.stringify(payload)],
    );
  }

  async enqueueOutbox(
    routingKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO wallet_outbox (id, routing_key, payload, created_at)
        VALUES ($1, $2, $3::jsonb, $4)
      `,
      [randomUUID(), routingKey, JSON.stringify(payload), new Date()],
    );
  }

  async listUnpublishedOutbox(limit: number): Promise<WalletOutboxMessage[]> {
    const result = await this.postgres.query<OutboxRow>(
      `
        SELECT id, routing_key, payload
        FROM wallet_outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      payload: row.payload,
      routingKey: row.routing_key,
    }));
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.postgres.query(
      "UPDATE wallet_outbox SET published_at = $2 WHERE id = $1",
      [id, new Date()],
    );
  }

  private async ensureWallet(
    client: PoolClient,
    playerId: string,
    username: string,
    defaultBalanceCents: number,
  ): Promise<WalletDto> {
    const existing = await this.findWalletForUpdate(client, playerId, false);
    const now = new Date();

    if (existing) {
      await client.query(
        "UPDATE wallets SET username = $2, updated_at = $3 WHERE player_id = $1",
        [playerId, username, now],
      );

      return {
        ...existing,
        username,
        updatedAt: now.toISOString(),
      };
    }

    await client.query(
      `
        INSERT INTO wallets
          (player_id, username, balance_cents, currency, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $5)
      `,
      [playerId, username, defaultBalanceCents, DEFAULT_CURRENCY, now],
    );

    const wallet: WalletDto = {
      playerId,
      username,
      balanceCents: defaultBalanceCents,
      currency: DEFAULT_CURRENCY,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.insertLedger(client, {
      id: randomUUID(),
      idempotencyKey: `wallet-seed:${playerId}`,
      playerId,
      type: "credit",
      reason: "wallet_seed",
      amountCents: defaultBalanceCents,
      balanceAfterCents: defaultBalanceCents,
      correlationId: `wallet:${playerId}`,
      metadata: { source: "seed" },
      createdAt: now.toISOString(),
    });

    return wallet;
  }

  private async findWalletForUpdate(
    client: PoolClient,
    playerId: string,
    required = true,
  ): Promise<WalletDto | null> {
    const result = await client.query<WalletRow>(
      "SELECT * FROM wallets WHERE player_id = $1 FOR UPDATE",
      [playerId],
    );

    const row = result.rows[0];

    if (!row) {
      if (required) {
        throw walletNotFound(playerId);
      }

      return null;
    }

    return mapWallet(row);
  }

  private async findLedgerByIdempotencyKey(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<WalletLedgerEntryDto | null> {
    const result = await client.query<LedgerRow>(
      "SELECT * FROM wallet_ledger_entries WHERE idempotency_key = $1",
      [idempotencyKey],
    );

    const row = result.rows[0];
    return row ? mapLedgerEntry(row) : null;
  }

  private async insertLedger(
    client: PoolClient,
    entry: WalletLedgerEntryDto,
  ): Promise<WalletLedgerEntryDto> {
    await client.query(
      `
        INSERT INTO wallet_ledger_entries
          (
            id,
            idempotency_key,
            player_id,
            type,
            reason,
            amount_cents,
            balance_after_cents,
            correlation_id,
            metadata,
            created_at
          )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      `,
      [
        entry.id,
        entry.idempotencyKey,
        entry.playerId,
        entry.type,
        entry.reason,
        entry.amountCents,
        entry.balanceAfterCents,
        entry.correlationId,
        JSON.stringify(entry.metadata),
        entry.createdAt,
      ],
    );

    return { ...entry };
  }
}

export class InMemoryWalletsRepository implements WalletsRepository {
  private readonly wallets = new Map<string, WalletDto>();
  private readonly ledgerByIdempotencyKey = new Map<string, WalletLedgerEntryDto>();
  private readonly inbox = new Map<string, WalletCommandOutcomeDto>();
  private readonly outbox = new Map<string, WalletOutboxMessage & { published: boolean }>();

  async migrate(): Promise<void> {}

  async createWallet(
    request: Required<CreateWalletRequestDto>,
    defaultBalanceCents: number,
  ): Promise<WalletDto> {
    const now = new Date().toISOString();
    const existing = this.wallets.get(request.playerId);

    if (existing) {
      const wallet = { ...existing, username: request.username, updatedAt: now };
      this.wallets.set(wallet.playerId, wallet);
      return { ...wallet };
    }

    const wallet: WalletDto = {
      playerId: request.playerId,
      username: request.username,
      balanceCents: defaultBalanceCents,
      currency: DEFAULT_CURRENCY,
      createdAt: now,
      updatedAt: now,
    };

    this.wallets.set(wallet.playerId, wallet);
    this.ledgerByIdempotencyKey.set(`wallet-seed:${wallet.playerId}`, {
      id: randomUUID(),
      idempotencyKey: `wallet-seed:${wallet.playerId}`,
      playerId: wallet.playerId,
      type: "credit",
      reason: "wallet_seed",
      amountCents: wallet.balanceCents,
      balanceAfterCents: wallet.balanceCents,
      correlationId: `wallet:${wallet.playerId}`,
      metadata: { source: "seed" },
      createdAt: now,
    });

    return { ...wallet };
  }

  async findWallet(playerId: string): Promise<WalletDto | null> {
    const wallet = this.wallets.get(playerId);
    return wallet ? { ...wallet } : null;
  }

  async executeCommand(
    command: WalletCommandDto,
    defaultBalanceCents: number,
  ): Promise<WalletCommandResultDto> {
    const previousEntry = this.ledgerByIdempotencyKey.get(command.idempotencyKey);

    if (previousEntry) {
      const wallet = await this.findWallet(previousEntry.playerId);

      if (!wallet) {
        throw walletNotFound(previousEntry.playerId);
      }

      return {
        accepted: true,
        idempotent: true,
        ledgerEntry: { ...previousEntry },
        wallet,
      };
    }

    const wallet =
      (await this.findWallet(command.playerId)) ??
      (await this.createWallet(
        {
          playerId: command.playerId,
          username: command.username ?? command.playerId,
        },
        defaultBalanceCents,
      ));
    const nextBalanceCents =
      command.type === "debit"
        ? wallet.balanceCents - command.amountCents
        : wallet.balanceCents + command.amountCents;

    if (nextBalanceCents < 0) {
      throw insufficientFunds();
    }

    const now = new Date().toISOString();
    const updatedWallet: WalletDto = {
      ...wallet,
      username: command.username ?? wallet.username,
      balanceCents: nextBalanceCents,
      updatedAt: now,
    };
    const ledgerEntry: WalletLedgerEntryDto = {
      id: randomUUID(),
      idempotencyKey: command.idempotencyKey,
      playerId: command.playerId,
      type: command.type,
      reason: command.reason,
      amountCents: command.amountCents,
      balanceAfterCents: nextBalanceCents,
      correlationId: command.correlationId,
      metadata: command.metadata ?? {},
      createdAt: now,
    };

    this.wallets.set(updatedWallet.playerId, updatedWallet);
    this.ledgerByIdempotencyKey.set(command.idempotencyKey, ledgerEntry);

    return {
      accepted: true,
      idempotent: false,
      ledgerEntry,
      wallet: { ...updatedWallet },
    };
  }

  async listLedger(playerId?: string): Promise<WalletLedgerEntryDto[]> {
    return Array.from(this.ledgerByIdempotencyKey.values())
      .filter((entry) => !playerId || entry.playerId === playerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((entry) => ({ ...entry }));
  }

  async findInboxResult(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null> {
    return this.inbox.get(idempotencyKey) ?? null;
  }

  async saveInboxResult(
    idempotencyKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void> {
    this.inbox.set(idempotencyKey, payload);
  }

  async enqueueOutbox(
    routingKey: string,
    payload: WalletCommandOutcomeDto,
  ): Promise<void> {
    const id = randomUUID();
    this.outbox.set(id, { id, payload, published: false, routingKey });
  }

  async listUnpublishedOutbox(limit: number): Promise<WalletOutboxMessage[]> {
    return Array.from(this.outbox.values())
      .filter((message) => !message.published)
      .slice(0, limit)
      .map(({ id, payload, routingKey }) => ({ id, payload, routingKey }));
  }

  async markOutboxPublished(id: string): Promise<void> {
    const message = this.outbox.get(id);

    if (message) {
      message.published = true;
    }
  }
}

function mapWallet(row: WalletRow): WalletDto {
  return {
    playerId: row.player_id,
    username: row.username,
    balanceCents: Number(row.balance_cents),
    currency: row.currency,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapLedgerEntry(row: LedgerRow): WalletLedgerEntryDto {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    playerId: row.player_id,
    type: row.type,
    reason: row.reason,
    amountCents: Number(row.amount_cents),
    balanceAfterCents: Number(row.balance_after_cents),
    correlationId: row.correlation_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at.toISOString(),
  };
}

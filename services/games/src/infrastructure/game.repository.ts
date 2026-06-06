import {
  type BetDto,
  type EventMetadata,
  type RoundDto,
  type RoundHistoryItemDto,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
} from "@crash/contracts";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { PostgresService } from "./postgres.service";

export const GAME_REPOSITORY = Symbol("GAME_REPOSITORY");

export interface RoundRecord extends RoundDto {
  serverSeed: string;
  hmac: string;
  crashPointBp: number;
  bets: BetDto[];
}

export interface GameOutboxMessage {
  id: string;
  routingKey: string;
  payload: WalletCommandDto;
}

export interface GameRepository {
  migrate(): Promise<void>;
  loadLatestRound(): Promise<RoundRecord | null>;
  saveRound(round: RoundRecord): Promise<void>;
  updateRound(round: RoundRecord): Promise<void>;
  insertBet(bet: BetDto): Promise<void>;
  updateBet(bet: BetDto): Promise<void>;
  findBet(betId: string): Promise<BetDto | null>;
  listBetHistory(playerId: string): Promise<BetDto[]>;
  listHistory(limit: number): Promise<RoundHistoryItemDto[]>;
  enqueueWalletCommand(
    routingKey: string,
    command: WalletCommandDto,
  ): Promise<void>;
  listUnpublishedOutbox(limit: number): Promise<GameOutboxMessage[]>;
  markOutboxPublished(id: string): Promise<void>;
  findInboxOutcome(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null>;
  saveInboxOutcome(
    idempotencyKey: string,
    outcome: WalletCommandOutcomeDto,
  ): Promise<void>;
}

interface RoundRow extends QueryResultRow {
  id: string;
  nonce: number;
  phase: RoundDto["phase"];
  current_multiplier_bp: number;
  crash_point_bp: number;
  betting_ends_at: Date;
  started_at: Date | null;
  crashed_at: Date | null;
  server_seed_hash: string;
  server_seed: string;
  client_seed: string;
  hmac: string;
}

interface BetRow extends QueryResultRow {
  id: string;
  round_id: string;
  player_id: string;
  username: string;
  amount_cents: string;
  status: BetDto["status"];
  placed_at: Date;
  cashout_at: Date | null;
  cashout_multiplier_bp: number | null;
  payout_cents: string | null;
}

interface OutboxRow extends QueryResultRow {
  id: string;
  routing_key: string;
  payload: WalletCommandDto;
}

interface InboxRow extends QueryResultRow {
  payload: WalletCommandOutcomeDto | null;
}

@Injectable()
export class PostgresGameRepository implements GameRepository {
  private migrationPromise?: Promise<void>;

  constructor(private readonly postgres: PostgresService) {}

  async migrate(): Promise<void> {
    this.migrationPromise ??= this.runMigrations();
    await this.migrationPromise;
  }

  private async runMigrations(): Promise<void> {
    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS game_rounds (
        id TEXT PRIMARY KEY,
        nonce INTEGER NOT NULL,
        phase TEXT NOT NULL,
        current_multiplier_bp INTEGER NOT NULL,
        crash_point_bp INTEGER NOT NULL,
        betting_ends_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        crashed_at TIMESTAMPTZ,
        server_seed_hash TEXT NOT NULL,
        server_seed TEXT NOT NULL,
        client_seed TEXT NOT NULL,
        hmac TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS game_bets (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL REFERENCES game_rounds(id),
        player_id TEXT NOT NULL,
        username TEXT NOT NULL,
        amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
        status TEXT NOT NULL,
        placed_at TIMESTAMPTZ NOT NULL,
        cashout_at TIMESTAMPTZ,
        cashout_multiplier_bp INTEGER,
        payout_cents BIGINT
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS game_outbox (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        routing_key TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        published_at TIMESTAMPTZ
      )
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS game_inbox (
        idempotency_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        received_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_game_bets_player_placed
      ON game_bets(player_id, placed_at DESC)
    `);

    await this.postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_game_rounds_phase_created
      ON game_rounds(phase, created_at DESC)
    `);

    await this.postgres.query(`
      CREATE INDEX IF NOT EXISTS idx_game_outbox_unpublished
      ON game_outbox(created_at)
      WHERE published_at IS NULL
    `);
  }

  async loadLatestRound(): Promise<RoundRecord | null> {
    const roundResult = await this.postgres.query<RoundRow>(
      "SELECT * FROM game_rounds ORDER BY created_at DESC LIMIT 1",
    );
    const round = roundResult.rows[0];

    if (!round) {
      return null;
    }

    const betsResult = await this.postgres.query<BetRow>(
      "SELECT * FROM game_bets WHERE round_id = $1 ORDER BY placed_at ASC",
      [round.id],
    );

    return mapRound(round, betsResult.rows.map(mapBet));
  }

  async saveRound(round: RoundRecord): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO game_rounds
          (
            id,
            nonce,
            phase,
            current_multiplier_bp,
            crash_point_bp,
            betting_ends_at,
            started_at,
            crashed_at,
            server_seed_hash,
            server_seed,
            client_seed,
            hmac,
            created_at
          )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        round.id,
        round.nonce,
        round.phase,
        round.currentMultiplierBp,
        round.crashPointBp,
        round.bettingEndsAt,
        round.startedAt ?? null,
        round.crashedAt ?? null,
        round.serverSeedHash,
        round.serverSeed,
        round.clientSeed,
        round.hmac,
        round.bettingEndsAt,
      ],
    );
  }

  async updateRound(round: RoundRecord): Promise<void> {
    await this.postgres.query(
      `
        UPDATE game_rounds
        SET
          phase = $2,
          current_multiplier_bp = $3,
          crash_point_bp = $4,
          betting_ends_at = $5,
          started_at = $6,
          crashed_at = $7
        WHERE id = $1
      `,
      [
        round.id,
        round.phase,
        round.currentMultiplierBp,
        round.crashPointBp,
        round.bettingEndsAt,
        round.startedAt ?? null,
        round.crashedAt ?? null,
      ],
    );
  }

  async insertBet(bet: BetDto): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO game_bets
          (
            id,
            round_id,
            player_id,
            username,
            amount_cents,
            status,
            placed_at,
            cashout_at,
            cashout_multiplier_bp,
            payout_cents
          )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        bet.id,
        bet.roundId,
        bet.playerId,
        bet.username,
        bet.amountCents,
        bet.status,
        bet.placedAt,
        bet.cashoutAt ?? null,
        bet.cashoutMultiplierBp ?? null,
        bet.payoutCents ?? null,
      ],
    );
  }

  async updateBet(bet: BetDto): Promise<void> {
    await this.postgres.query(
      `
        UPDATE game_bets
        SET
          status = $2,
          cashout_at = $3,
          cashout_multiplier_bp = $4,
          payout_cents = $5
        WHERE id = $1
      `,
      [
        bet.id,
        bet.status,
        bet.cashoutAt ?? null,
        bet.cashoutMultiplierBp ?? null,
        bet.payoutCents ?? null,
      ],
    );
  }

  async findBet(betId: string): Promise<BetDto | null> {
    const result = await this.postgres.query<BetRow>(
      "SELECT * FROM game_bets WHERE id = $1",
      [betId],
    );

    return result.rows[0] ? mapBet(result.rows[0]) : null;
  }

  async listBetHistory(playerId: string): Promise<BetDto[]> {
    const result = await this.postgres.query<BetRow>(
      `
        SELECT * FROM game_bets
        WHERE player_id = $1
        ORDER BY placed_at DESC
        LIMIT 100
      `,
      [playerId],
    );

    return result.rows.map(mapBet);
  }

  async listHistory(limit: number): Promise<RoundHistoryItemDto[]> {
    const result = await this.postgres.query<RoundRow>(
      `
        SELECT * FROM game_rounds
        WHERE phase = 'crashed'
        ORDER BY crashed_at DESC NULLS LAST, created_at DESC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      nonce: row.nonce,
      crashPointBp: row.crash_point_bp,
      serverSeedHash: row.server_seed_hash,
      serverSeed: row.server_seed,
      clientSeed: row.client_seed,
      hmac: row.hmac,
      startedAt: (row.started_at ?? row.betting_ends_at).toISOString(),
      crashedAt: (row.crashed_at ?? row.betting_ends_at).toISOString(),
    }));
  }

  async enqueueWalletCommand(
    routingKey: string,
    command: WalletCommandDto,
  ): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO game_outbox
          (id, idempotency_key, routing_key, payload, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT (idempotency_key) DO NOTHING
      `,
      [
        randomUUID(),
        command.idempotencyKey,
        routingKey,
        JSON.stringify(command),
        new Date(),
      ],
    );
  }

  async listUnpublishedOutbox(limit: number): Promise<GameOutboxMessage[]> {
    const result = await this.postgres.query<OutboxRow>(
      `
        SELECT id, routing_key, payload
        FROM game_outbox
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
      "UPDATE game_outbox SET published_at = $2 WHERE id = $1",
      [id, new Date()],
    );
  }

  async findInboxOutcome(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null> {
    const result = await this.postgres.query<InboxRow>(
      "SELECT payload FROM game_inbox WHERE idempotency_key = $1",
      [idempotencyKey],
    );

    return result.rows[0]?.payload ?? null;
  }

  async saveInboxOutcome(
    idempotencyKey: string,
    outcome: WalletCommandOutcomeDto,
  ): Promise<void> {
    await this.postgres.query(
      `
        INSERT INTO game_inbox (idempotency_key, payload, received_at)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (idempotency_key)
        DO UPDATE SET payload = EXCLUDED.payload
      `,
      [idempotencyKey, JSON.stringify(outcome), new Date()],
    );
  }
}

export class InMemoryGameRepository implements GameRepository {
  private round: RoundRecord | null = null;
  private readonly bets = new Map<string, BetDto>();
  private readonly inbox = new Map<string, WalletCommandOutcomeDto>();
  private readonly outbox = new Map<string, GameOutboxMessage & { published: boolean }>();

  async migrate(): Promise<void> {}

  async loadLatestRound(): Promise<RoundRecord | null> {
    return this.round
      ? {
          ...this.round,
          bets: this.round.bets.map((bet) => ({ ...bet })),
        }
      : null;
  }

  async saveRound(round: RoundRecord): Promise<void> {
    this.round = {
      ...round,
      bets: round.bets.map((bet) => ({ ...bet })),
    };
  }

  async updateRound(round: RoundRecord): Promise<void> {
    await this.saveRound(round);
  }

  async insertBet(bet: BetDto): Promise<void> {
    this.bets.set(bet.id, { ...bet });

    if (this.round?.id === bet.roundId) {
      this.round.bets.push({ ...bet });
    }
  }

  async updateBet(bet: BetDto): Promise<void> {
    this.bets.set(bet.id, { ...bet });

    if (this.round?.id === bet.roundId) {
      const index = this.round.bets.findIndex((candidate) => candidate.id === bet.id);

      if (index >= 0) {
        this.round.bets[index] = { ...bet };
      }
    }
  }

  async findBet(betId: string): Promise<BetDto | null> {
    const bet = this.bets.get(betId);
    return bet ? { ...bet } : null;
  }

  async listBetHistory(playerId: string): Promise<BetDto[]> {
    return Array.from(this.bets.values())
      .filter((bet) => bet.playerId === playerId)
      .sort((left, right) => right.placedAt.localeCompare(left.placedAt))
      .map((bet) => ({ ...bet }));
  }

  async listHistory(limit: number): Promise<RoundHistoryItemDto[]> {
    if (!this.round || this.round.phase !== "crashed") {
      return [];
    }

    return [
      {
        id: this.round.id,
        nonce: this.round.nonce,
        crashPointBp: this.round.crashPointBp,
        serverSeedHash: this.round.serverSeedHash,
        serverSeed: this.round.serverSeed,
        clientSeed: this.round.clientSeed,
        hmac: this.round.hmac,
        startedAt: this.round.startedAt ?? this.round.bettingEndsAt,
        crashedAt: this.round.crashedAt ?? this.round.bettingEndsAt,
      },
    ].slice(0, limit);
  }

  async enqueueWalletCommand(
    routingKey: string,
    command: WalletCommandDto,
  ): Promise<void> {
    const id = randomUUID();
    this.outbox.set(id, { id, payload: command, published: false, routingKey });
  }

  async listUnpublishedOutbox(limit: number): Promise<GameOutboxMessage[]> {
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

  async findInboxOutcome(
    idempotencyKey: string,
  ): Promise<WalletCommandOutcomeDto | null> {
    return this.inbox.get(idempotencyKey) ?? null;
  }

  async saveInboxOutcome(
    idempotencyKey: string,
    outcome: WalletCommandOutcomeDto,
  ): Promise<void> {
    this.inbox.set(idempotencyKey, outcome);
  }
}

function mapRound(row: RoundRow, bets: BetDto[]): RoundRecord {
  return {
    id: row.id,
    nonce: row.nonce,
    phase: row.phase,
    currentMultiplierBp: row.current_multiplier_bp,
    crashPointBp: row.crash_point_bp,
    bettingEndsAt: row.betting_ends_at.toISOString(),
    startedAt: row.started_at?.toISOString(),
    crashedAt: row.crashed_at?.toISOString(),
    serverSeedHash: row.server_seed_hash,
    serverSeed: row.server_seed,
    clientSeed: row.client_seed,
    hmac: row.hmac,
    bets,
  };
}

function mapBet(row: BetRow): BetDto {
  return {
    id: row.id,
    roundId: row.round_id,
    playerId: row.player_id,
    username: row.username,
    amountCents: Number(row.amount_cents),
    status: row.status,
    placedAt: row.placed_at.toISOString(),
    cashoutAt: row.cashout_at?.toISOString(),
    cashoutMultiplierBp: row.cashout_multiplier_bp ?? undefined,
    payoutCents: row.payout_cents ? Number(row.payout_cents) : undefined,
  };
}

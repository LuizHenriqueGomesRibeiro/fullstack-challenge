import { Injectable, type MessageEvent, OnModuleDestroy } from "@nestjs/common";
import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  payoutForMultiplier,
  type BetDto,
  type CashoutResultDto,
  type PlaceBetRequestDto,
  type PlaceBetResultDto,
  type RealtimeEventDto,
  type RoundDto,
  type RoundHistoryItemDto,
  type RoundVerifyDto,
  type WalletCommandDto,
  isPositiveInteger,
} from "@crash/contracts";
import { Subject, type Observable } from "rxjs";
import { randomUUID } from "node:crypto";
import {
  bettingClosed,
  cashoutUnavailable,
  duplicatedBet,
  invalidBetAmount,
  roundNotFound,
  walletRejected,
} from "../domain/game.errors";
import {
  createProvablyFairRound,
  type ProvablyFairResult,
} from "../domain/provably-fair";
import {
  WalletsClientError,
  WalletsHttpClient,
} from "../infrastructure/wallets-http.client";

const MIN_BET_CENTS = 100;
const MAX_BET_CENTS = 100_000;

interface RoundRecord extends RoundDto {
  serverSeed: string;
  hmac: string;
  crashPointBp: number;
  bets: BetDto[];
}

@Injectable()
export class GameEngineService implements OnModuleDestroy {
  private readonly eventsSubject = new Subject<MessageEvent>();
  private readonly bettingWindowMs = readIntegerEnv("BETTING_WINDOW_MS", 10_000);
  private readonly postCrashDelayMs = readIntegerEnv("POST_CRASH_DELAY_MS", 3_000);
  private readonly tickMs = readIntegerEnv("ROUND_TICK_MS", 250);
  private readonly growthBpPerSecond = readIntegerEnv(
    "MULTIPLIER_GROWTH_BP_PER_SECOND",
    250,
  );
  private readonly clientSeed = process.env.CRASH_CLIENT_SEED ?? "jungle-demo";

  private currentRound: RoundRecord;
  private nonce = 0;
  private sequence = 0;
  private roundStartTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;
  private nextRoundTimer?: ReturnType<typeof setTimeout>;
  private readonly history: RoundHistoryItemDto[] = [];
  private readonly betHistory: BetDto[] = [];

  constructor(private readonly walletsClient: WalletsHttpClient) {
    this.currentRound = this.createNextRound();
  }

  get realtimeEvents$(): Observable<MessageEvent> {
    return this.eventsSubject.asObservable();
  }

  onModuleDestroy(): void {
    this.clearTimers();
    this.eventsSubject.complete();
  }

  getCurrentRound(): RoundDto {
    this.refreshCurrentMultiplier();
    return this.toRoundDto(this.currentRound);
  }

  getHistory(): RoundHistoryItemDto[] {
    return this.history.slice(0, 20).map((round) => ({ ...round }));
  }

  getBetHistory(playerId = DEFAULT_PLAYER_ID): BetDto[] {
    return this.betHistory
      .filter((bet) => bet.playerId === playerId)
      .slice()
      .reverse()
      .map((bet) => ({ ...bet }));
  }

  verifyRound(roundId: string): RoundVerifyDto {
    const round = this.history.find((item) => item.id === roundId);

    if (!round) {
      throw roundNotFound(roundId);
    }

    return {
      ...round,
      roundId: round.id,
      algorithm:
        "HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), first 52 bits mapped to crash multiplier basis points with a 1/33 instant-crash house edge.",
    };
  }

  async placeBet(
    request: PlaceBetRequestDto,
    playerId = DEFAULT_PLAYER_ID,
    username = DEFAULT_USERNAME,
  ): Promise<PlaceBetResultDto> {
    const round = this.currentRound;

    if (round.phase !== "betting") {
      throw bettingClosed();
    }

    if (
      !isPositiveInteger(request.amountCents) ||
      request.amountCents < MIN_BET_CENTS ||
      request.amountCents > MAX_BET_CENTS
    ) {
      throw invalidBetAmount();
    }

    if (round.bets.some((bet) => bet.playerId === playerId)) {
      throw duplicatedBet();
    }

    const bet: BetDto = {
      id: randomUUID(),
      roundId: round.id,
      playerId,
      username: request.username?.trim() || username,
      amountCents: request.amountCents,
      status: "reserved",
      placedAt: new Date().toISOString(),
    };

    const wallet = await this.executeWalletCommand({
      idempotencyKey: `bet:${round.id}:${playerId}`,
      playerId,
      username: bet.username,
      type: "debit",
      reason: "bet_placed",
      amountCents: bet.amountCents,
      correlationId: bet.id,
      metadata: {
        betId: bet.id,
        roundId: round.id,
      },
    });

    round.bets.push(bet);
    this.betHistory.push(bet);
    this.emit("bet.placed", { bet, wallet: wallet.wallet });
    this.emit("wallet.updated", wallet.wallet);

    return { bet: { ...bet }, wallet: wallet.wallet };
  }

  async cashout(
    playerId = DEFAULT_PLAYER_ID,
  ): Promise<CashoutResultDto> {
    const round = this.currentRound;
    this.refreshCurrentMultiplier();

    if (round.phase !== "running" || round.currentMultiplierBp >= round.crashPointBp) {
      if (round.phase === "running") {
        this.crashRound();
      }

      throw cashoutUnavailable();
    }

    const bet = round.bets.find(
      (candidate) =>
        candidate.playerId === playerId && candidate.status === "reserved",
    );

    if (!bet) {
      throw cashoutUnavailable();
    }

    const payoutCents = payoutForMultiplier(
      bet.amountCents,
      round.currentMultiplierBp,
    );

    const wallet = await this.executeWalletCommand({
      idempotencyKey: `cashout:${round.id}:${playerId}`,
      playerId,
      username: bet.username,
      type: "credit",
      reason: "cashout_payout",
      amountCents: payoutCents,
      correlationId: bet.id,
      metadata: {
        betId: bet.id,
        roundId: round.id,
        multiplierBp: round.currentMultiplierBp,
      },
    });

    bet.status = "cashed_out";
    bet.cashoutAt = new Date().toISOString();
    bet.cashoutMultiplierBp = round.currentMultiplierBp;
    bet.payoutCents = payoutCents;

    this.emit("bet.cashout", { bet, wallet: wallet.wallet });
    this.emit("wallet.updated", wallet.wallet);

    return { bet: { ...bet }, wallet: wallet.wallet };
  }

  private createNextRound(): RoundRecord {
    this.clearTimers();

    const fairRound = createProvablyFairRound(this.clientSeed, ++this.nonce);
    const now = Date.now();
    const round: RoundRecord = {
      id: `round-${fairRound.nonce}-${now}`,
      nonce: fairRound.nonce,
      phase: "betting",
      currentMultiplierBp: 100,
      crashPointBp: fairRound.crashPointBp,
      bettingEndsAt: new Date(now + this.bettingWindowMs).toISOString(),
      serverSeedHash: fairRound.serverSeedHash,
      serverSeed: fairRound.serverSeed,
      clientSeed: fairRound.clientSeed,
      hmac: fairRound.hmac,
      bets: [],
    };

    this.roundStartTimer = setTimeout(
      () => this.startRound(),
      this.bettingWindowMs,
    );
    this.emit("round.created", this.toRoundDto(round));
    return round;
  }

  private startRound(): void {
    const round = this.currentRound;

    if (round.phase !== "betting") {
      return;
    }

    round.phase = "running";
    round.startedAt = new Date().toISOString();
    round.currentMultiplierBp = 100;
    this.emit("round.started", this.toRoundDto(round));

    this.tickTimer = setInterval(() => this.tickRound(), this.tickMs);
    this.tickRound();
  }

  private tickRound(): void {
    const round = this.currentRound;

    if (round.phase !== "running") {
      return;
    }

    this.refreshCurrentMultiplier();
    this.emit("round.tick", {
      roundId: round.id,
      currentMultiplierBp: round.currentMultiplierBp,
    });

    if (round.currentMultiplierBp >= round.crashPointBp) {
      this.crashRound();
    }
  }

  private crashRound(): void {
    const round = this.currentRound;

    if (round.phase === "crashed") {
      return;
    }

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }

    round.phase = "crashed";
    round.currentMultiplierBp = round.crashPointBp;
    round.crashedAt = new Date().toISOString();

    for (const bet of round.bets) {
      if (bet.status === "reserved") {
        bet.status = "lost";
      }
    }

    const historyItem = this.toHistoryItem(round);
    this.history.unshift(historyItem);
    this.history.splice(20);
    this.emit("round.crashed", {
      round: this.toRoundDto(round),
      verify: historyItem,
    });

    this.nextRoundTimer = setTimeout(() => {
      this.currentRound = this.createNextRound();
    }, this.postCrashDelayMs);
  }

  private refreshCurrentMultiplier(): void {
    const round = this.currentRound;

    if (round.phase !== "running" || !round.startedAt) {
      return;
    }

    const elapsedMs = Date.now() - Date.parse(round.startedAt);
    const nextMultiplier =
      100 + Math.floor((elapsedMs * this.growthBpPerSecond) / 1000);
    round.currentMultiplierBp = Math.min(nextMultiplier, round.crashPointBp);
  }

  private async executeWalletCommand(command: WalletCommandDto) {
    try {
      return await this.walletsClient.executeCommand(command);
    } catch (error) {
      if (error instanceof WalletsClientError) {
        throw walletRejected(error.message, error.code);
      }

      throw error;
    }
  }

  private emit<TPayload>(
    type: RealtimeEventDto<TPayload>["type"],
    payload: TPayload,
  ): void {
    const event: RealtimeEventDto<TPayload> = {
      sequence: ++this.sequence,
      type,
      payload,
      occurredAt: new Date().toISOString(),
    };

    this.eventsSubject.next({
      id: String(event.sequence),
      type,
      data: event,
    });
  }

  private toRoundDto(round: RoundRecord): RoundDto {
    return {
      id: round.id,
      nonce: round.nonce,
      phase: round.phase,
      currentMultiplierBp: round.currentMultiplierBp,
      crashPointBp: round.phase === "crashed" ? round.crashPointBp : undefined,
      bettingEndsAt: round.bettingEndsAt,
      startedAt: round.startedAt,
      crashedAt: round.crashedAt,
      serverSeedHash: round.serverSeedHash,
      clientSeed: round.clientSeed,
      bets: round.bets.map((bet) => ({ ...bet })),
    };
  }

  private toHistoryItem(round: RoundRecord): RoundHistoryItemDto {
    return {
      id: round.id,
      nonce: round.nonce,
      crashPointBp: round.crashPointBp,
      serverSeedHash: round.serverSeedHash,
      serverSeed: round.serverSeed,
      clientSeed: round.clientSeed,
      hmac: round.hmac,
      startedAt: round.startedAt ?? round.bettingEndsAt,
      crashedAt: round.crashedAt ?? new Date().toISOString(),
    };
  }

  private clearTimers(): void {
    if (this.roundStartTimer) {
      clearTimeout(this.roundStartTimer);
      this.roundStartTimer = undefined;
    }

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = undefined;
    }

    if (this.nextRoundTimer) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = undefined;
    }
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

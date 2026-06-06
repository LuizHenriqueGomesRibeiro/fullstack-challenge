import { Injectable } from "@nestjs/common";
import {
  type BetDto,
  type RealtimeEventDto,
  type RoundDto,
  type RoundHistoryItemDto,
} from "@crash/contracts";
import { Subject, type Observable } from "rxjs";
import type { RoundRecord } from "../infrastructure/game.repository";
import { readIntegerEnv } from "./game-engine.config";

@Injectable()
export class GameEngineState {
  readonly bettingWindowMs = readIntegerEnv("BETTING_WINDOW_MS", 10_000);
  readonly postCrashDelayMs = readIntegerEnv("POST_CRASH_DELAY_MS", 3_000);
  readonly tickMs = readIntegerEnv("ROUND_TICK_MS", 250);
  readonly growthBpPerSecond = readIntegerEnv(
    "MULTIPLIER_GROWTH_BP_PER_SECOND",
    250,
  );
  readonly clientSeed = process.env.CRASH_CLIENT_SEED ?? "jungle-demo";

  currentRound?: RoundRecord;
  nonce = 0;
  roundStartTimer?: ReturnType<typeof setTimeout>;
  tickTimer?: ReturnType<typeof setInterval>;
  nextRoundTimer?: ReturnType<typeof setTimeout>;

  private sequence = 0;
  private readonly eventsSubject = new Subject<RealtimeEventDto>();
  private readonly eventBuffer: RealtimeEventDto[] = [];
  private readonly history: RoundHistoryItemDto[] = [];

  get realtimeEvents$(): Observable<RealtimeEventDto> {
    return this.eventsSubject.asObservable();
  }

  get currentSequence(): number {
    return this.sequence;
  }

  setHistory(history: RoundHistoryItemDto[]): void {
    this.history.splice(0, this.history.length, ...history);
  }

  addHistory(round: RoundHistoryItemDto): void {
    this.history.unshift(round);
    this.history.splice(20);
  }

  getHistory(): RoundHistoryItemDto[] {
    return this.history.slice(0, 20).map((round) => ({ ...round }));
  }

  findHistoryRound(roundId: string): RoundHistoryItemDto | undefined {
    return this.history.find((item) => item.id === roundId);
  }

  getEventsAfter(sequence: number): RealtimeEventDto[] {
    return this.eventBuffer
      .filter((event) => event.sequence > sequence)
      .map((event) => ({ ...event }));
  }

  emit<TPayload>(
    type: RealtimeEventDto<TPayload>["type"],
    payload: TPayload,
  ): void {
    const event: RealtimeEventDto<TPayload> = {
      sequence: ++this.sequence,
      type,
      payload,
      occurredAt: new Date().toISOString(),
    };

    this.eventBuffer.push(event);
    this.eventBuffer.splice(0, Math.max(0, this.eventBuffer.length - 500));
    this.eventsSubject.next(event);
  }

  completeEvents(): void {
    this.eventsSubject.complete();
  }

  refreshCurrentMultiplier(): void {
    const round = this.requireCurrentRound();

    if (round.phase !== "running" || !round.startedAt) {
      return;
    }

    const elapsedMs = Date.now() - Date.parse(round.startedAt);
    const nextMultiplier =
      100 + Math.floor((elapsedMs * this.growthBpPerSecond) / 1000);
    round.currentMultiplierBp = Math.min(nextMultiplier, round.crashPointBp);
  }

  requireCurrentRound(): RoundRecord {
    if (!this.currentRound) {
      throw new Error("Game engine has not been initialized.");
    }

    return this.currentRound;
  }

  findLoadedBet(betId: string): BetDto | undefined {
    return this.currentRound?.bets.find((bet) => bet.id === betId);
  }

  replaceLoadedBet(bet: BetDto): void {
    if (!this.currentRound || this.currentRound.id !== bet.roundId) {
      return;
    }

    const index = this.currentRound.bets.findIndex(
      (candidate) => candidate.id === bet.id,
    );

    if (index >= 0) {
      this.currentRound.bets[index] = { ...bet };
    }
  }

  clearTimers(): void {
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

  toRoundDto(round: RoundRecord): RoundDto {
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

  toHistoryItem(round: RoundRecord): RoundHistoryItemDto {
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
}

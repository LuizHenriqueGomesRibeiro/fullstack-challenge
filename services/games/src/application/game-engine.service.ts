import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
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
  type WalletCommandOutcomeDto,
  isPositiveInteger,
} from "@crash/contracts";
import { Subject, type Observable, type Subscription } from "rxjs";
import { randomUUID } from "node:crypto";
import {
  bettingClosed,
  cashoutUnavailable,
  duplicatedBet,
  invalidBetAmount,
  roundNotFound,
  walletRejected,
} from "../domain/game.errors";
import { createProvablyFairRound } from "../domain/provably-fair";
import {
  GAME_REPOSITORY,
  type GameRepository,
  type RoundRecord,
} from "../infrastructure/game.repository";
import {
  WalletsClientError,
  WalletsEventsClient,
} from "../infrastructure/wallets-events.client";

const MIN_BET_CENTS = 100;
const MAX_BET_CENTS = 100_000;

@Injectable()
export class GameEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly eventsSubject = new Subject<RealtimeEventDto>();
  private readonly bettingWindowMs = readIntegerEnv("BETTING_WINDOW_MS", 10_000);
  private readonly postCrashDelayMs = readIntegerEnv("POST_CRASH_DELAY_MS", 3_000);
  private readonly tickMs = readIntegerEnv("ROUND_TICK_MS", 250);
  private readonly growthBpPerSecond = readIntegerEnv(
    "MULTIPLIER_GROWTH_BP_PER_SECOND",
    250,
  );
  private readonly clientSeed = process.env.CRASH_CLIENT_SEED ?? "jungle-demo";

  private currentRound?: RoundRecord;
  private nonce = 0;
  private sequence = 0;
  private roundStartTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;
  private nextRoundTimer?: ReturnType<typeof setTimeout>;
  private walletOutcomeSubscription?: Subscription;
  private readonly eventBuffer: RealtimeEventDto[] = [];
  private readonly history: RoundHistoryItemDto[] = [];

  constructor(
    private readonly walletsClient: WalletsEventsClient,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  get realtimeEvents$(): Observable<RealtimeEventDto> {
    return this.eventsSubject.asObservable();
  }

  get currentSequence(): number {
    return this.sequence;
  }

  getEventsAfter(sequence: number): RealtimeEventDto[] {
    return this.eventBuffer
      .filter((event) => event.sequence > sequence)
      .map((event) => ({ ...event }));
  }

  async onModuleInit(): Promise<void> {
    await this.gameRepository.migrate();
    this.walletOutcomeSubscription = this.walletsClient.outcomes$.subscribe(
      (outcome) => {
        void this.applyWalletOutcome(outcome);
      },
    );

    const latestRound = await this.gameRepository.loadLatestRound();
    const history = await this.gameRepository.listHistory(20);
    this.history.splice(0, this.history.length, ...history);

    if (latestRound) {
      this.nonce = latestRound.nonce;
    }

    if (latestRound && latestRound.phase !== "crashed") {
      this.currentRound = latestRound;
      await this.restoreRoundTimers();
      return;
    }

    this.currentRound = await this.createNextRound();
  }

  onModuleDestroy(): void {
    this.clearTimers();
    this.walletOutcomeSubscription?.unsubscribe();
    this.eventsSubject.complete();
  }

  getCurrentRound(): RoundDto {
    const round = this.requireCurrentRound();
    this.refreshCurrentMultiplier();
    return this.toRoundDto(round);
  }

  getHistory(): RoundHistoryItemDto[] {
    return this.history.slice(0, 20).map((round) => ({ ...round }));
  }

  async getBetHistory(playerId = DEFAULT_PLAYER_ID): Promise<BetDto[]> {
    return this.gameRepository.listBetHistory(playerId);
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
    const round = this.requireCurrentRound();

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

    if (
      round.bets.some(
        (bet) => bet.playerId === playerId && bet.status !== "rejected",
      )
    ) {
      throw duplicatedBet();
    }

    const bet: BetDto = {
      id: randomUUID(),
      roundId: round.id,
      playerId,
      username: request.username?.trim() || username,
      amountCents: request.amountCents,
      status: "pending",
      placedAt: new Date().toISOString(),
    };

    round.bets.push(bet);
    await this.gameRepository.insertBet(bet);

    const command: WalletCommandDto = {
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
    };
    const outcome = await this.executeWalletCommand(command);

    if (!outcome.accepted) {
      await this.rejectBet(
        bet,
        outcome.rejectionCode,
        outcome.rejectionMessage,
      );
      throw walletRejected(outcome.rejectionMessage, outcome.rejectionCode);
    }

    if (bet.status !== "reserved") {
      bet.status = "reserved";
      await this.gameRepository.updateBet(bet);
      this.emit("bet.placed", { bet: { ...bet }, wallet: outcome.wallet });
      this.emit("wallet.updated", outcome.wallet);
    }

    return { bet: { ...bet }, wallet: outcome.wallet };
  }

  async cashout(playerId = DEFAULT_PLAYER_ID): Promise<CashoutResultDto> {
    const round = this.requireCurrentRound();
    this.refreshCurrentMultiplier();

    if (round.phase !== "running" || round.currentMultiplierBp >= round.crashPointBp) {
      if (round.phase === "running") {
        await this.crashRound();
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
    const command: WalletCommandDto = {
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
    };
    const outcome = await this.executeWalletCommand(command);

    if (!outcome.accepted) {
      throw walletRejected(outcome.rejectionMessage, outcome.rejectionCode);
    }

    if (bet.status !== "cashed_out") {
      bet.status = "cashed_out";
      bet.cashoutAt = new Date().toISOString();
      bet.cashoutMultiplierBp = round.currentMultiplierBp;
      bet.payoutCents = payoutCents;
      await this.gameRepository.updateBet(bet);

      this.emit("bet.cashout", { bet: { ...bet }, wallet: outcome.wallet });
      this.emit("wallet.updated", outcome.wallet);
    }

    return { bet: { ...bet }, wallet: outcome.wallet };
  }

  private async restoreRoundTimers(): Promise<void> {
    const round = this.requireCurrentRound();

    this.clearTimers();

    if (round.phase === "betting") {
      const remainingMs = Date.parse(round.bettingEndsAt) - Date.now();

      if (remainingMs > 0) {
        this.roundStartTimer = setTimeout(() => {
          void this.startRound();
        }, remainingMs);
        return;
      }

      await this.startRound();
      return;
    }

    if (round.phase === "running") {
      this.refreshCurrentMultiplier();

      if (round.currentMultiplierBp >= round.crashPointBp) {
        await this.crashRound();
        return;
      }

      await this.gameRepository.updateRound(round);
      this.tickTimer = setInterval(() => {
        void this.tickRound();
      }, this.tickMs);
    }
  }

  private async createNextRound(): Promise<RoundRecord> {
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

    await this.gameRepository.saveRound(round);
    this.roundStartTimer = setTimeout(() => {
      void this.startRound();
    }, this.bettingWindowMs);
    this.emit("round.created", this.toRoundDto(round));
    return round;
  }

  private async startRound(): Promise<void> {
    const round = this.requireCurrentRound();

    if (round.phase !== "betting") {
      return;
    }

    round.phase = "running";
    round.startedAt = new Date().toISOString();
    round.currentMultiplierBp = 100;
    await this.gameRepository.updateRound(round);
    this.emit("round.started", this.toRoundDto(round));

    this.tickTimer = setInterval(() => {
      void this.tickRound();
    }, this.tickMs);
    await this.tickRound();
  }

  private async tickRound(): Promise<void> {
    const round = this.requireCurrentRound();

    if (round.phase !== "running") {
      return;
    }

    this.refreshCurrentMultiplier();
    this.emit("round.tick", {
      roundId: round.id,
      currentMultiplierBp: round.currentMultiplierBp,
    });

    if (round.currentMultiplierBp >= round.crashPointBp) {
      await this.crashRound();
    }
  }

  private async crashRound(): Promise<void> {
    const round = this.requireCurrentRound();

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
      if (bet.status === "reserved" || bet.status === "pending") {
        bet.status = "lost";
        await this.gameRepository.updateBet(bet);
      }
    }

    await this.gameRepository.updateRound(round);
    const historyItem = this.toHistoryItem(round);
    this.history.unshift(historyItem);
    this.history.splice(20);
    this.emit("round.crashed", {
      round: this.toRoundDto(round),
      verify: historyItem,
    });

    this.nextRoundTimer = setTimeout(() => {
      void this.createNextRound().then((nextRound) => {
        this.currentRound = nextRound;
      });
    }, this.postCrashDelayMs);
  }

  private refreshCurrentMultiplier(): void {
    const round = this.requireCurrentRound();

    if (round.phase !== "running" || !round.startedAt) {
      return;
    }

    const elapsedMs = Date.now() - Date.parse(round.startedAt);
    const nextMultiplier =
      100 + Math.floor((elapsedMs * this.growthBpPerSecond) / 1000);
    round.currentMultiplierBp = Math.min(nextMultiplier, round.crashPointBp);
  }

  private async executeWalletCommand(
    command: WalletCommandDto,
  ): Promise<WalletCommandOutcomeDto> {
    try {
      return await this.walletsClient.executeCommand(command);
    } catch (error) {
      if (error instanceof WalletsClientError) {
        throw walletRejected(
          "Wallet command did not finish before the timeout.",
          error.code,
        );
      }

      throw error;
    }
  }

  private async applyWalletOutcome(
    outcome: WalletCommandOutcomeDto,
  ): Promise<void> {
    const metadata = outcome.accepted
      ? outcome.ledgerEntry.metadata
      : outcome.metadata;
    const betId =
      typeof metadata.betId === "string" ? metadata.betId : undefined;

    if (!betId) {
      return;
    }

    const bet = this.findLoadedBet(betId) ?? (await this.gameRepository.findBet(betId));

    if (!bet) {
      return;
    }

    if (!outcome.accepted) {
      if (bet.status === "pending") {
        await this.rejectBet(bet, outcome.rejectionCode, outcome.rejectionMessage);
      }

      return;
    }

    if (outcome.ledgerEntry.reason === "bet_placed" && bet.status === "pending") {
      bet.status = "reserved";
      await this.gameRepository.updateBet(bet);
      this.replaceLoadedBet(bet);
      this.emit("bet.placed", { bet: { ...bet }, wallet: outcome.wallet });
      this.emit("wallet.updated", outcome.wallet);
      return;
    }

    if (
      outcome.ledgerEntry.reason === "cashout_payout" &&
      bet.status === "reserved"
    ) {
      const multiplierBp =
        typeof metadata.multiplierBp === "number"
          ? metadata.multiplierBp
          : this.requireCurrentRound().currentMultiplierBp;

      bet.status = "cashed_out";
      bet.cashoutAt = new Date().toISOString();
      bet.cashoutMultiplierBp = multiplierBp;
      bet.payoutCents = outcome.ledgerEntry.amountCents;
      await this.gameRepository.updateBet(bet);
      this.replaceLoadedBet(bet);
      this.emit("bet.cashout", { bet: { ...bet }, wallet: outcome.wallet });
      this.emit("wallet.updated", outcome.wallet);
    }
  }

  private async rejectBet(
    bet: BetDto,
    code: string,
    message: string,
  ): Promise<void> {
    bet.status = "rejected";
    await this.gameRepository.updateBet(bet);
    this.replaceLoadedBet(bet);
    this.emit("bet.rejected", {
      bet: { ...bet },
      code,
      message,
    });
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

    this.eventBuffer.push(event);
    this.eventBuffer.splice(0, Math.max(0, this.eventBuffer.length - 500));
    this.eventsSubject.next(event);
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

  private findLoadedBet(betId: string): BetDto | undefined {
    return this.currentRound?.bets.find((bet) => bet.id === betId);
  }

  private replaceLoadedBet(bet: BetDto): void {
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

  private requireCurrentRound(): RoundRecord {
    if (!this.currentRound) {
      throw new Error("Game engine has not been initialized.");
    }

    return this.currentRound;
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

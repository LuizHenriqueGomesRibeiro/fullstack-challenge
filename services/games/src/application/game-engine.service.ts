import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  type BetDto,
  type CashoutResultDto,
  type PlaceBetRequestDto,
  type PlaceBetResultDto,
  type RealtimeEventDto,
  type RoundDto,
  type RoundHistoryItemDto,
  type RoundVerifyDto,
} from "@crash/contracts";
import type { Observable, Subscription } from "rxjs";
import { roundNotFound } from "../domain/game.errors";
import { WalletsEventsClient } from "../infrastructure/wallets-events.client";
import { ApplyWalletOutcomeUseCase } from "./use-cases/apply-wallet-outcome.use-case";
import { CashoutUseCase } from "./use-cases/cashout.use-case";
import { GameEngineState } from "./game-engine.state";
import { GetBetHistoryUseCase } from "./use-cases/get-bet-history.use-case";
import { PlaceBetUseCase } from "./use-cases/place-bet.use-case";
import { RoundLifecycleUseCase } from "./use-cases/round-lifecycle.use-case";

@Injectable()
export class GameEngineService implements OnModuleInit, OnModuleDestroy {
  private walletOutcomeSubscription?: Subscription;

  constructor(
    private readonly walletsClient: WalletsEventsClient,
    private readonly state: GameEngineState,
    private readonly roundLifecycle: RoundLifecycleUseCase,
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashoutUseCase: CashoutUseCase,
    private readonly getBetHistoryUseCase: GetBetHistoryUseCase,
    private readonly applyWalletOutcomeUseCase: ApplyWalletOutcomeUseCase,
  ) {}

  get realtimeEvents$(): Observable<RealtimeEventDto> {
    return this.state.realtimeEvents$;
  }

  get currentSequence(): number {
    return this.state.currentSequence;
  }

  getEventsAfter(sequence: number): RealtimeEventDto[] {
    return this.state.getEventsAfter(sequence);
  }

  async onModuleInit(): Promise<void> {
    this.walletOutcomeSubscription = this.walletsClient.outcomes$.subscribe((outcome) => {
      void this.applyWalletOutcomeUseCase.execute(outcome);
    });
    await this.roundLifecycle.initialize();
  }

  onModuleDestroy(): void {
    this.roundLifecycle.stop();
    this.walletOutcomeSubscription?.unsubscribe();
    this.state.completeEvents();
  }

  getCurrentRound(): RoundDto {
    this.state.refreshCurrentMultiplier();
    return this.state.toRoundDto(this.state.requireCurrentRound());
  }

  getHistory(): RoundHistoryItemDto[] {
    return this.state.getHistory();
  }

  getBetHistory(playerId = DEFAULT_PLAYER_ID): Promise<BetDto[]> {
    return this.getBetHistoryUseCase.execute(playerId);
  }

  verifyRound(roundId: string): RoundVerifyDto {
    const round = this.state.findHistoryRound(roundId);

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

  placeBet(request: PlaceBetRequestDto, playerId = DEFAULT_PLAYER_ID, username = DEFAULT_USERNAME): Promise<PlaceBetResultDto> {
    return this.placeBetUseCase.execute(request, playerId, username);
  }

  cashout(playerId = DEFAULT_PLAYER_ID): Promise<CashoutResultDto> {
    return this.cashoutUseCase.execute(playerId);
  }
}

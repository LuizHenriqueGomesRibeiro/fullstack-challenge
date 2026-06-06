import { Inject, Injectable } from "@nestjs/common";
import { GAME_REPOSITORY, type GameRepository, type RoundRecord } from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";
import { CrashRoundUseCase } from "./crash-round.use-case";
import { CreateRoundUseCase } from "./create-round.use-case";
import { StartRoundUseCase } from "./start-round.use-case";
import { TickRoundUseCase } from "./tick-round.use-case";

@Injectable()
export class RoundLifecycleUseCase {
  constructor(
    private readonly state: GameEngineState,
    private readonly createRound: CreateRoundUseCase,
    private readonly crashRoundUseCase: CrashRoundUseCase,
    private readonly startRoundUseCase: StartRoundUseCase,
    private readonly tickRoundUseCase: TickRoundUseCase,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async initialize(): Promise<void> {
    await this.gameRepository.migrate();
    const latestRound = await this.gameRepository.loadLatestRound();
    this.state.setHistory(await this.gameRepository.listHistory(20));
    if (latestRound) {
      this.state.nonce = latestRound.nonce;
    }
    if (latestRound && latestRound.phase !== "crashed") {
      this.state.currentRound = latestRound;
      await this.restoreTimers();
      return;
    }
    this.state.currentRound = await this.scheduleNextRound();
  }

  stop(): void { this.state.clearTimers(); }

  async restoreTimers(): Promise<void> {
    const round = this.state.requireCurrentRound();
    this.state.clearTimers();
    if (round.phase === "betting") {
      const remainingMs = Date.parse(round.bettingEndsAt) - Date.now();
      if (remainingMs > 0) {
        this.state.roundStartTimer = setTimeout(() => void this.startRound(), remainingMs);
        return;
      }
      await this.startRound();
      return;
    }
    if (round.phase === "running") {
      this.state.refreshCurrentMultiplier();
      if (round.currentMultiplierBp >= round.crashPointBp) {
        await this.crashRound();
        return;
      }
      await this.gameRepository.updateRound(round);
      this.state.tickTimer = setInterval(() => void this.tickRound(), this.state.tickMs);
    }
  }

  async scheduleNextRound(): Promise<RoundRecord> {
    this.state.clearTimers();
    const round = await this.createRound.execute();
    this.state.roundStartTimer = setTimeout(() => void this.startRound(), this.state.bettingWindowMs);
    return round;
  }

  async startRound(): Promise<void> {
    if (!(await this.startRoundUseCase.execute())) {
      return;
    }
    this.state.tickTimer = setInterval(() => void this.tickRound(), this.state.tickMs);
    await this.tickRound();
  }

  async tickRound(): Promise<void> {
    if (this.tickRoundUseCase.execute()) await this.crashRound();
  }

  async crashRound(): Promise<void> {
    const round = this.state.requireCurrentRound();
    if (round.phase === "crashed") {
      return;
    }
    this.clearTickTimer();
    await this.crashRoundUseCase.execute();
    this.state.nextRoundTimer = setTimeout(() => {
      void this.scheduleNextRound().then((nextRound) => {
        this.state.currentRound = nextRound;
      });
    }, this.state.postCrashDelayMs);
  }

  private clearTickTimer(): void {
    if (!this.state.tickTimer) return;
    clearInterval(this.state.tickTimer);
    this.state.tickTimer = undefined;
  }
}

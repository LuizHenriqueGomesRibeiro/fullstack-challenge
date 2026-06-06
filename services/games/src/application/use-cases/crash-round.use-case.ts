import { Inject, Injectable } from "@nestjs/common";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";

@Injectable()
export class CrashRoundUseCase {
  constructor(
    private readonly state: GameEngineState,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(): Promise<void> {
    const round = this.state.requireCurrentRound();

    if (round.phase === "crashed") {
      return;
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
    const historyItem = this.state.toHistoryItem(round);
    this.state.addHistory(historyItem);
    this.state.emit("round.crashed", {
      round: this.state.toRoundDto(round),
      verify: historyItem,
    });
  }
}

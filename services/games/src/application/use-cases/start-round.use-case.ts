import { Inject, Injectable } from "@nestjs/common";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { GameEngineState } from "../game-engine.state";

@Injectable()
export class StartRoundUseCase {
  constructor(
    private readonly state: GameEngineState,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(): Promise<boolean> {
    const round = this.state.requireCurrentRound();

    if (round.phase !== "betting") {
      return false;
    }

    round.phase = "running";
    round.startedAt = new Date().toISOString();
    round.currentMultiplierBp = 100;
    await this.gameRepository.updateRound(round);
    this.state.emit("round.started", this.state.toRoundDto(round));
    return true;
  }
}

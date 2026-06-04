import { Injectable } from "@nestjs/common";
import { type BetDto } from "@crash/contracts";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";
import { Inject } from "@nestjs/common";
import { GameEngineState } from "../game-engine.state";

@Injectable()
export class RejectBetUseCase {
  constructor(
    private readonly state: GameEngineState,
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  async execute(bet: BetDto, code: string, message: string): Promise<void> {
    bet.status = "rejected";
    await this.gameRepository.updateBet(bet);
    this.state.replaceLoadedBet(bet);
    this.state.emit("bet.rejected", {
      bet: { ...bet },
      code,
      message,
    });
  }
}

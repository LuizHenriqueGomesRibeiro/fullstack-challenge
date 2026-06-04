import { Inject, Injectable } from "@nestjs/common";
import { type BetDto } from "@crash/contracts";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "../../infrastructure/game.repository";

@Injectable()
export class GetBetHistoryUseCase {
  constructor(
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  execute(playerId: string): Promise<BetDto[]> {
    return this.gameRepository.listBetHistory(playerId);
  }
}

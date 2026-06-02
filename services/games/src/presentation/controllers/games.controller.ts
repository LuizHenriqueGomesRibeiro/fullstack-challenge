import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
} from "@nestjs/common";
import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  PLAYER_ID_HEADER,
  PLAYER_NAME_HEADER,
  type BetDto,
  type CashoutResultDto,
  type PlaceBetRequestDto,
  type PlaceBetResultDto,
  type RoundDto,
  type RoundHistoryItemDto,
  type RoundVerifyDto,
} from "@crash/contracts";
import { GameEngineService } from "../../application/game-engine.service";
import { GameDomainError } from "../../domain/game.errors";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

@Controller()
export class GamesController {
  constructor(private readonly gameEngine: GameEngineService) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  @Get("rounds/current")
  getCurrentRound(): RoundDto {
    return this.gameEngine.getCurrentRound();
  }

  @Get("rounds/history")
  getRoundHistory(): RoundHistoryItemDto[] {
    return this.gameEngine.getHistory();
  }

  @Get("rounds/:roundId/verify")
  verifyRound(@Param("roundId") roundId: string): RoundVerifyDto {
    return this.handle(() => this.gameEngine.verifyRound(roundId));
  }

  @Get("bets/me")
  getMyBets(@Headers(PLAYER_ID_HEADER) playerId?: string): BetDto[] {
    return this.gameEngine.getBetHistory(playerId ?? DEFAULT_PLAYER_ID);
  }

  @Post("bet")
  async placeBet(
    @Body() body: PlaceBetRequestDto,
    @Headers(PLAYER_ID_HEADER) playerId?: string,
    @Headers(PLAYER_NAME_HEADER) username?: string,
  ): Promise<PlaceBetResultDto> {
    return this.handleAsync(() =>
      this.gameEngine.placeBet(
        body,
        playerId ?? DEFAULT_PLAYER_ID,
        username ?? DEFAULT_USERNAME,
      ),
    );
  }

  @Post("bet/cashout")
  async cashout(
    @Headers(PLAYER_ID_HEADER) playerId?: string,
  ): Promise<CashoutResultDto> {
    return this.handleAsync(() =>
      this.gameEngine.cashout(playerId ?? DEFAULT_PLAYER_ID),
    );
  }

  private handle<TResult>(operation: () => TResult): TResult {
    try {
      return operation();
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  private async handleAsync<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  private throwHttpError(error: unknown): never {
    if (error instanceof GameDomainError) {
      throw new HttpException(
        { code: error.code, message: error.message },
        error.statusCode,
      );
    }

    throw error;
  }
}

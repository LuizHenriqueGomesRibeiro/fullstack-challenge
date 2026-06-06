import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type AuthenticatedPlayerDto,
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
import { CurrentPlayer } from "../../infrastructure/auth/authenticated-player.decorator";
import { JwtAuthGuard } from "../../infrastructure/auth/jwt-auth.guard";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

@ApiTags("games")
@Controller()
export class GamesController {
  constructor(private readonly gameEngine: GameEngineService) {}

  @ApiOperation({ summary: "Game service health check" })
  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "games" };
  }

  @ApiOperation({ summary: "Get the current round" })
  @Get("rounds/current")
  getCurrentRound(): RoundDto {
    return this.gameEngine.getCurrentRound();
  }

  @ApiOperation({ summary: "Get crashed round history" })
  @Get("rounds/history")
  getRoundHistory(): RoundHistoryItemDto[] {
    return this.gameEngine.getHistory();
  }

  @ApiOperation({ summary: "Get provably fair verification data for a round" })
  @Get("rounds/:roundId/verify")
  verifyRound(@Param("roundId") roundId: string): RoundVerifyDto {
    return this.handle(() => this.gameEngine.verifyRound(roundId));
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get authenticated player's bet history" })
  @UseGuards(JwtAuthGuard)
  @Get("bets/me")
  async getMyBets(
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<BetDto[]> {
    return this.handleAsync(() => this.gameEngine.getBetHistory(player.playerId));
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Place a bet in the current betting window" })
  @UseGuards(JwtAuthGuard)
  @Post("bet")
  async placeBet(
    @Body() body: PlaceBetRequestDto,
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<PlaceBetResultDto> {
    return this.handleAsync(() =>
      this.gameEngine.placeBet(
        body,
        player.playerId,
        player.username,
      ),
    );
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Cash out the authenticated player's active bet" })
  @UseGuards(JwtAuthGuard)
  @Post("bet/cashout")
  async cashout(
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<CashoutResultDto> {
    return this.handleAsync(() =>
      this.gameEngine.cashout(player.playerId),
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

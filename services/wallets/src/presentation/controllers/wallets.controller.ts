import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  type AuthenticatedPlayerDto,
  type CreateWalletRequestDto,
  type WalletDto,
  type WalletLedgerEntryDto,
} from "@crash/contracts";
import { WalletsService } from "../../application/wallets.service";
import { WalletDomainError } from "../../domain/wallet.errors";
import { CurrentPlayer } from "../../infrastructure/auth/authenticated-player.decorator";
import { JwtAuthGuard } from "../../infrastructure/auth/jwt-auth.guard";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

@ApiTags("wallets")
@Controller()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @ApiOperation({ summary: "Wallet service health check" })
  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Create or update the authenticated player's wallet" })
  @UseGuards(JwtAuthGuard)
  @Post()
  async createWallet(
    @Body() body: CreateWalletRequestDto | undefined,
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<WalletDto> {
    return this.handleAsync(() =>
      this.walletsService.createWallet({
        playerId: player.playerId,
        username: body?.username?.trim() || player.username,
      }),
    );
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated player's wallet" })
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async getMyWallet(
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<WalletDto> {
    return this.handleAsync(() => this.walletsService.getWallet(player.playerId));
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated player's wallet ledger" })
  @UseGuards(JwtAuthGuard)
  @Get("ledger/me")
  async getMyLedger(
    @CurrentPlayer() player: AuthenticatedPlayerDto,
  ): Promise<WalletLedgerEntryDto[]> {
    return this.handleAsync(() => this.walletsService.listLedger(player.playerId));
  }

  private async handleAsync<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof WalletDomainError) {
        throw new HttpException(
          { code: error.code, message: error.message },
          error.statusCode,
        );
      }

      throw error;
    }
  }
}

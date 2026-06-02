import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Post,
} from "@nestjs/common";
import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  PLAYER_ID_HEADER,
  PLAYER_NAME_HEADER,
  type CreateWalletRequestDto,
  type WalletCommandDto,
  type WalletCommandResultDto,
  type WalletDto,
  type WalletLedgerEntryDto,
} from "@crash/contracts";
import { WalletsService } from "../../application/wallets.service";
import { WalletDomainError } from "../../domain/wallet.errors";
import { HealthCheckResponseDto } from "../dtos/health-check-response.dto";

@Controller()
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get("health")
  check(): HealthCheckResponseDto {
    return { status: "ok", service: "wallets" };
  }

  @Post()
  createWallet(
    @Body() body: CreateWalletRequestDto | undefined,
    @Headers(PLAYER_ID_HEADER) playerId?: string,
    @Headers(PLAYER_NAME_HEADER) username?: string,
  ): WalletDto {
    return this.walletsService.createWallet({
      playerId: body?.playerId ?? playerId ?? DEFAULT_PLAYER_ID,
      username: body?.username ?? username ?? DEFAULT_USERNAME,
    });
  }

  @Get("me")
  getMyWallet(@Headers(PLAYER_ID_HEADER) playerId?: string): WalletDto {
    return this.walletsService.getWallet(playerId ?? DEFAULT_PLAYER_ID);
  }

  @Get("ledger/me")
  getMyLedger(
    @Headers(PLAYER_ID_HEADER) playerId?: string,
  ): WalletLedgerEntryDto[] {
    return this.walletsService.listLedger(playerId ?? DEFAULT_PLAYER_ID);
  }

  @Post("internal/wallet-commands")
  executeWalletCommand(
    @Body() command: WalletCommandDto,
  ): WalletCommandResultDto {
    try {
      return this.walletsService.executeCommand(command);
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

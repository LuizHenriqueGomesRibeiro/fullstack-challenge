import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  type CreateWalletRequestDto,
  type WalletCommandDto,
  type WalletCommandResultDto,
  type WalletDto,
  type WalletLedgerEntryDto,
  isPositiveInteger,
} from "@crash/contracts";
import {
  invalidWalletAmount,
  walletNotFound,
} from "../domain/wallet.errors";
import {
  WALLETS_REPOSITORY,
  type WalletsRepository,
} from "../infrastructure/wallets.repository";

@Injectable()
export class WalletsService implements OnModuleInit {
  private readonly defaultBalanceCents = readIntegerEnv(
    "DEFAULT_WALLET_BALANCE_CENTS",
    100_000,
  );

  constructor(
    @Inject(WALLETS_REPOSITORY)
    private readonly walletsRepository: WalletsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.walletsRepository.migrate();
    await this.createWallet({
      playerId: DEFAULT_PLAYER_ID,
      username: DEFAULT_USERNAME,
    });
  }

  async createWallet(request: CreateWalletRequestDto = {}): Promise<WalletDto> {
    return this.walletsRepository.createWallet(
      {
        playerId: normalizeId(request.playerId, DEFAULT_PLAYER_ID),
        username: normalizeId(request.username, DEFAULT_USERNAME),
      },
      this.defaultBalanceCents,
    );
  }

  async getWallet(playerId = DEFAULT_PLAYER_ID): Promise<WalletDto> {
    const wallet = await this.walletsRepository.findWallet(
      normalizeId(playerId, DEFAULT_PLAYER_ID),
    );

    if (!wallet) {
      throw walletNotFound(playerId);
    }

    return wallet;
  }

  async executeCommand(
    command: WalletCommandDto,
  ): Promise<WalletCommandResultDto> {
    if (!isPositiveInteger(command.amountCents)) {
      throw invalidWalletAmount();
    }

    return this.walletsRepository.executeCommand(
      {
        ...command,
        playerId: normalizeId(command.playerId, DEFAULT_PLAYER_ID),
      },
      this.defaultBalanceCents,
    );
  }

  async listLedger(playerId?: string): Promise<WalletLedgerEntryDto[]> {
    return this.walletsRepository.listLedger(playerId);
  }
}

function normalizeId(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

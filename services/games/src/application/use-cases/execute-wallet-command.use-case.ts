import { Injectable } from "@nestjs/common";
import {
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
} from "@crash/contracts";
import { walletRejected } from "../../domain/game.errors";
import {
  WalletsClientError,
  WalletsEventsClient,
} from "../../infrastructure/wallets-events.client";

@Injectable()
export class ExecuteWalletCommandUseCase {
  constructor(private readonly walletsClient: WalletsEventsClient) {}

  async execute(
    command: WalletCommandDto,
  ): Promise<WalletCommandOutcomeDto> {
    try {
      return await this.walletsClient.executeCommand(command);
    } catch (error) {
      if (error instanceof WalletsClientError) {
        throw walletRejected(
          "Wallet command did not finish before the timeout.",
          error.code,
        );
      }

      throw error;
    }
  }
}

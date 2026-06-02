import { Injectable } from "@nestjs/common";
import type {
  ErrorResponseDto,
  WalletCommandDto,
  WalletCommandResultDto,
} from "@crash/contracts";

@Injectable()
export class WalletsHttpClient {
  private readonly baseUrl =
    process.env.WALLETS_URL?.replace(/\/$/, "") ?? "http://localhost:4002";

  async executeCommand(
    command: WalletCommandDto,
  ): Promise<WalletCommandResultDto> {
    const response = await fetch(`${this.baseUrl}/internal/wallet-commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      const error = (await safeJson(response)) as Partial<ErrorResponseDto>;
      throw new WalletsClientError(
        error.code ?? "WALLET_COMMAND_FAILED",
        error.message ?? "Wallet command failed.",
        response.status,
      );
    }

    return (await response.json()) as WalletCommandResultDto;
  }
}

export class WalletsClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export class WalletDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function invalidWalletAmount(): WalletDomainError {
  return new WalletDomainError(
    "WALLET_AMOUNT_INVALID",
    "Amounts must be positive integer cents.",
    400,
  );
}

export function walletNotFound(playerId: string): WalletDomainError {
  return new WalletDomainError(
    "WALLET_NOT_FOUND",
    `Wallet not found for player ${playerId}.`,
    404,
  );
}

export function insufficientFunds(): WalletDomainError {
  return new WalletDomainError(
    "WALLET_INSUFFICIENT_FUNDS",
    "Wallet balance is not enough for this debit.",
    409,
  );
}

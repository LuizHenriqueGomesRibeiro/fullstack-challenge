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
    `Carteira do usuário ${playerId} não encontrada.`,
    404,
  );
}

export function insufficientFunds(): WalletDomainError {
  return new WalletDomainError(
    "WALLET_INSUFFICIENT_FUNDS",
    "Sem saldo suficiente.",
    409,
  );
}

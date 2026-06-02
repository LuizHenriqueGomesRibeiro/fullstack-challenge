export class GameDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function invalidBetAmount(): GameDomainError {
  return new GameDomainError(
    "BET_AMOUNT_INVALID",
    "Bet amount must be between 100 and 100000 integer cents.",
    400,
  );
}

export function bettingClosed(): GameDomainError {
  return new GameDomainError(
    "ROUND_BETTING_CLOSED",
    "Bets are accepted only while the current round is in betting phase.",
    409,
  );
}

export function duplicatedBet(): GameDomainError {
  return new GameDomainError(
    "BET_ALREADY_PLACED",
    "Each player can place only one bet per round.",
    409,
  );
}

export function cashoutUnavailable(): GameDomainError {
  return new GameDomainError(
    "CASHOUT_UNAVAILABLE",
    "Cashout is available only for a reserved bet during a running round.",
    409,
  );
}

export function roundNotFound(roundId: string): GameDomainError {
  return new GameDomainError(
    "ROUND_NOT_FOUND",
    `Round ${roundId} was not found or is not yet verifiable.`,
    404,
  );
}

export function walletRejected(message: string, code = "WALLET_REJECTED"): GameDomainError {
  return new GameDomainError(code, message, 409);
}

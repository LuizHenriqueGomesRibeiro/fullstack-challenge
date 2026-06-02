export const PLAYER_ID_HEADER = "x-player-id";
export const PLAYER_NAME_HEADER = "x-player-name";
export const DEFAULT_PLAYER_ID = "player-1";
export const DEFAULT_USERNAME = "player";
export const DEFAULT_CURRENCY = "BRL";

export type Cents = number;
export type MultiplierBasisPoints = number;

export type RoundPhase = "betting" | "running" | "crashed";
export type BetStatus = "reserved" | "cashed_out" | "lost";

export type WalletCommandType = "debit" | "credit";
export type WalletCommandReason =
  | "bet_placed"
  | "cashout_payout"
  | "wallet_seed"
  | "manual_adjustment";

export type EventMetadata = Record<string, string | number | boolean | null>;

export interface WalletDto {
  playerId: string;
  username: string;
  balanceCents: Cents;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerEntryDto {
  id: string;
  idempotencyKey: string;
  playerId: string;
  type: WalletCommandType;
  reason: WalletCommandReason;
  amountCents: Cents;
  balanceAfterCents: Cents;
  correlationId: string;
  metadata: EventMetadata;
  createdAt: string;
}

export interface WalletCommandDto {
  idempotencyKey: string;
  playerId: string;
  username?: string;
  type: WalletCommandType;
  reason: WalletCommandReason;
  amountCents: Cents;
  correlationId: string;
  metadata?: EventMetadata;
}

export interface WalletCommandResultDto {
  accepted: boolean;
  idempotent: boolean;
  wallet: WalletDto;
  ledgerEntry: WalletLedgerEntryDto;
}

export interface CreateWalletRequestDto {
  playerId?: string;
  username?: string;
}

export interface BetDto {
  id: string;
  roundId: string;
  playerId: string;
  username: string;
  amountCents: Cents;
  status: BetStatus;
  placedAt: string;
  cashoutAt?: string;
  cashoutMultiplierBp?: MultiplierBasisPoints;
  payoutCents?: Cents;
}

export interface RoundDto {
  id: string;
  nonce: number;
  phase: RoundPhase;
  currentMultiplierBp: MultiplierBasisPoints;
  crashPointBp?: MultiplierBasisPoints;
  bettingEndsAt: string;
  startedAt?: string;
  crashedAt?: string;
  serverSeedHash: string;
  clientSeed: string;
  bets: BetDto[];
}

export interface RoundHistoryItemDto {
  id: string;
  nonce: number;
  crashPointBp: MultiplierBasisPoints;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  hmac: string;
  startedAt: string;
  crashedAt: string;
}

export interface RoundVerifyDto extends RoundHistoryItemDto {
  roundId: string;
  algorithm: string;
}

export interface PlaceBetRequestDto {
  amountCents: Cents;
  username?: string;
}

export interface PlaceBetResultDto {
  bet: BetDto;
  wallet?: WalletDto;
}

export interface CashoutResultDto {
  bet: BetDto;
  wallet?: WalletDto;
}

export interface ErrorResponseDto {
  code: string;
  message: string;
}

export type RealtimeEventType =
  | "round.created"
  | "round.started"
  | "round.tick"
  | "bet.placed"
  | "bet.cashout"
  | "round.crashed"
  | "wallet.updated";

export interface RealtimeEventDto<TPayload = unknown> {
  sequence: number;
  type: RealtimeEventType;
  payload: TPayload;
  occurredAt: string;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

export function formatCents(cents: Cents, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat("pt-BR", {
    currency,
    style: "currency",
  }).format(cents / 100);
}

export function formatMultiplier(multiplierBp: MultiplierBasisPoints): string {
  return `${(multiplierBp / 100).toFixed(2)}x`;
}

export function payoutForMultiplier(
  amountCents: Cents,
  multiplierBp: MultiplierBasisPoints,
): Cents {
  return Number((BigInt(amountCents) * BigInt(multiplierBp)) / 100n);
}

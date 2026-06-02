import { makeApi, Zodios } from '@zodios/core'
import { z } from 'zod'
import {
  type BetDto,
  type CashoutResultDto,
  type PlaceBetResultDto,
  type RealtimeEventDto,
  type RoundDto,
  type RoundHistoryItemDto,
  type WalletDto,
} from '@crash/contracts'
import { playerHeaders } from '../hooks/auth/oidc'

const env = import.meta.env
const apiBaseUrl = (env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

const eventMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
)

const walletSchema = z.object({
  playerId: z.string(),
  username: z.string(),
  balanceCents: z.number().int(),
  currency: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<WalletDto>

const betSchema = z.object({
  id: z.string(),
  roundId: z.string(),
  playerId: z.string(),
  username: z.string(),
  amountCents: z.number().int(),
  status: z.enum(['reserved', 'cashed_out', 'lost']),
  placedAt: z.string(),
  cashoutAt: z.string().optional(),
  cashoutMultiplierBp: z.number().int().optional(),
  payoutCents: z.number().int().optional(),
}) satisfies z.ZodType<BetDto>

const roundSchema = z.object({
  id: z.string(),
  nonce: z.number().int(),
  phase: z.enum(['betting', 'running', 'crashed']),
  currentMultiplierBp: z.number().int(),
  crashPointBp: z.number().int().optional(),
  bettingEndsAt: z.string(),
  startedAt: z.string().optional(),
  crashedAt: z.string().optional(),
  serverSeedHash: z.string(),
  clientSeed: z.string(),
  bets: z.array(betSchema),
}) satisfies z.ZodType<RoundDto>

const historyItemSchema = z.object({
  id: z.string(),
  nonce: z.number().int(),
  crashPointBp: z.number().int(),
  serverSeedHash: z.string(),
  serverSeed: z.string(),
  clientSeed: z.string(),
  hmac: z.string(),
  startedAt: z.string(),
  crashedAt: z.string(),
}) satisfies z.ZodType<RoundHistoryItemDto>

const placeBetResultSchema = z.object({
  bet: betSchema,
  wallet: walletSchema.optional(),
}) satisfies z.ZodType<PlaceBetResultDto>

const cashoutResultSchema = z.object({
  bet: betSchema,
  wallet: walletSchema.optional(),
}) satisfies z.ZodType<CashoutResultDto>

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

const gamesEndpoints = makeApi([
  {
    method: 'get',
    path: '/rounds/current',
    alias: 'getCurrentRound',
    response: roundSchema,
  },
  {
    method: 'get',
    path: '/rounds/history',
    alias: 'getRoundHistory',
    response: z.array(historyItemSchema),
  },
  {
    method: 'get',
    path: '/bets/me',
    alias: 'getMyBets',
    response: z.array(betSchema),
  },
  {
    method: 'post',
    path: '/bet',
    alias: 'placeBet',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({
          amountCents: z.number().int().positive(),
          username: z.string().optional(),
        }),
      },
    ],
    response: placeBetResultSchema,
    errors: [{ status: 'default', schema: errorSchema }],
  },
  {
    method: 'post',
    path: '/bet/cashout',
    alias: 'cashout',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({}).optional(),
      },
    ],
    response: cashoutResultSchema,
    errors: [{ status: 'default', schema: errorSchema }],
  },
])

const walletsEndpoints = makeApi([
  {
    method: 'post',
    path: '/',
    alias: 'createWallet',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({
          playerId: z.string().optional(),
          username: z.string().optional(),
        }),
      },
    ],
    response: walletSchema,
  },
  {
    method: 'get',
    path: '/me',
    alias: 'getMyWallet',
    response: walletSchema,
  },
])

export const gamesApi = new Zodios(`${apiBaseUrl}/games`, gamesEndpoints, {
  validate: 'response',
})

export const walletsApi = new Zodios(
  `${apiBaseUrl}/wallets`,
  walletsEndpoints,
  {
    validate: 'response',
  },
)

export const realtimeEventSchema = z.object({
  sequence: z.number().int(),
  type: z.enum([
    'round.created',
    'round.started',
    'round.tick',
    'bet.placed',
    'bet.cashout',
    'round.crashed',
    'wallet.updated',
  ]),
  payload: z.unknown(),
  occurredAt: z.string(),
}) satisfies z.ZodType<RealtimeEventDto>

export const realtimeSocketUrl = apiBaseUrl
export const realtimeSocketPath = '/games/socket.io'

export { playerHeaders }

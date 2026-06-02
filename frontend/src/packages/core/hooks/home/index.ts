import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import {
  formatCents,
  formatMultiplier,
  payoutForMultiplier,
  type RealtimeEventDto,
  type RealtimeEventType,
} from '@crash/contracts'
import type { PlayerIdentity } from '../auth/oidc';
import {
  gamesApi,
  playerHeaders,
  realtimeEventSchema,
  realtimeSocketPath,
  realtimeSocketUrl,
  walletsApi,
} from '../../zodios/api';
import useUtil from '../util';

const realtimeTypes: RealtimeEventType[] = [
  'round.created',
  'round.started',
  'round.tick',
  'bet.placed',
  'bet.cashout',
  'round.crashed',
  'wallet.updated',
];

export default function useHome(player: PlayerIdentity) {
  const queryClient = useQueryClient();
  const [betAmount, setBetAmount] = useState('10,00');
  const [liveMultiplierBp, setLiveMultiplierBp] = useState(100);
  const [now, setNow] = useState(() => Date.now());
  const [lastEvent, setLastEvent] = useState<RealtimeEventDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    getErrorMessage,
    invalidateGameQueries,
    isTickPayload,
    parseMoneyToCents,
    ...util
  } = useUtil();

  const walletQuery = useQuery({
    queryKey: ['wallet', player.id],
    queryFn: async () => {
      try {
        return await walletsApi.getMyWallet({ headers: playerHeaders(player) })
      } catch {
        return walletsApi.createWallet(
          { playerId: player.id, username: player.username },
          { headers: playerHeaders(player) },
        )
      }
    },
  });

  const roundQuery = useQuery({
    queryKey: ['round', 'current'],
    queryFn: () => gamesApi.getCurrentRound(),
    refetchInterval: 2_000,
  });

  const historyQuery = useQuery({
    queryKey: ['rounds', 'history'],
    queryFn: () => gamesApi.getRoundHistory(),
  });

  const betsQuery = useQuery({
    queryKey: ['bets', player.id],
    queryFn: () => gamesApi.getMyBets({ headers: playerHeaders(player) }),
  });

  const round = roundQuery.data
  const ownBet = round?.bets.find((bet) => bet.playerId === player.id)
  const reservedBet = ownBet?.status === 'reserved' ? ownBet : undefined
  const parsedBetAmountCents = parseMoneyToCents(betAmount)
  const phase = round?.phase ?? 'betting'
  const canBet = phase === 'betting' && !ownBet && parsedBetAmountCents > 0
  const canCashout = phase === 'running' && Boolean(reservedBet)
  const potentialPayout = reservedBet
    ? payoutForMultiplier(reservedBet.amountCents, liveMultiplierBp)
    : payoutForMultiplier(parsedBetAmountCents, liveMultiplierBp)
  const bettingTimeLeftMs = round
    ? Math.max(0, Date.parse(round.bettingEndsAt) - now)
    : 0
  const graphProgress = Math.min(Math.max((liveMultiplierBp - 100) / 600, 0), 1)

  const sortedBets = useMemo(
    () =>
      [...(round?.bets ?? [])].sort((left, right) => {
        if (left.status === right.status) {
          return right.placedAt.localeCompare(left.placedAt)
        }

        return left.status === 'reserved' ? -1 : 1
      }),
    [round?.bets],
  )

  const placeBetMutation = useMutation({
    mutationFn: async () => {
      if (parsedBetAmountCents < 100 || parsedBetAmountCents > 100_000) {
        throw new Error('A aposta deve ficar entre R$ 1,00 e R$ 1.000,00.')
      }

      return gamesApi.placeBet(
        {
          amountCents: parsedBetAmountCents,
          username: player.username,
        },
        { headers: playerHeaders(player) },
      )
    },
    onSuccess: async (result) => {
      setNotice(`Aposta reservada: ${formatCents(result.bet.amountCents)}.`)
      await invalidateGameQueries(queryClient, player.id)
    },
    onError: (error) => setNotice(getErrorMessage(error)),
  })

  const cashoutMutation = useMutation({
    mutationFn: () => gamesApi.cashout({}, { headers: playerHeaders(player) }),
    onSuccess: async (result) => {
      setNotice(
        `Cashout em ${formatMultiplier(
          result.bet.cashoutMultiplierBp ?? liveMultiplierBp,
        )}: ${formatCents(result.bet.payoutCents ?? 0)}.`,
      )
      await invalidateGameQueries(queryClient, player.id)
    },
    onError: (error) => setNotice(getErrorMessage(error)),
  })

  useEffect(() => {
    if (round) {
      setLiveMultiplierBp(round.currentMultiplierBp)
    }
  }, [round])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const socket = io(realtimeSocketUrl, {
      path: realtimeSocketPath,
      transports: ['websocket'],
      withCredentials: true,
    })

    const handleEvent = (rawEvent: unknown) => {
      const parsed = realtimeEventSchema.safeParse(rawEvent)

      if (!parsed.success) {
        return
      }

      const event = parsed.data
      setLastEvent(event)

      if (event.type === 'round.tick' && isTickPayload(event.payload)) {
        setLiveMultiplierBp(event.payload.currentMultiplierBp)
        return
      }

      void invalidateGameQueries(queryClient, player.id)
    }

    for (const type of realtimeTypes) {
      socket.on(type, handleEvent)
    }

    socket.on('disconnect', () => {
      setNotice('WebSocket em tempo real desconectado. Mantendo polling leve.')
    })

    socket.on('connect_error', () => {
      setNotice('WebSocket em tempo real desconectado. Mantendo polling leve.')
    })

    return () => {
      socket.off('disconnect')
      socket.off('connect_error')

      for (const type of realtimeTypes) {
        socket.off(type, handleEvent)
      }

      socket.disconnect()
    }
  }, [player.id, queryClient])

  return {
    bettingTimeLeftMs,
    betAmount,
    betsQuery,
    canBet,
    canCashout,
    cashoutMutation,
    graphProgress,
    historyQuery,
    lastEvent,
    liveMultiplierBp,
    notice,
    phase,
    placeBetMutation,
    potentialPayout,
    reservedBet,
    round,
    setBetAmount,
    sortedBets,
    walletQuery,
    ...util
  }
}

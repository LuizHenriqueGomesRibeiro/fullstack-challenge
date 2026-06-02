import { createFileRoute } from '@tanstack/react-router'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  formatCents,
  formatMultiplier,
  payoutForMultiplier,
  type RealtimeEventDto,
  type RealtimeEventType,
} from '@crash/contracts'
import {
  demoPlayer,
  gamesApi,
  playerHeaders,
  realtimeEventSchema,
  realtimeEventsUrl,
  walletsApi,
} from '../zodios/api'

const realtimeTypes: RealtimeEventType[] = [
  'round.created',
  'round.started',
  'round.tick',
  'bet.placed',
  'bet.cashout',
  'round.crashed',
  'wallet.updated',
]

export function HomePage() {
  const queryClient = useQueryClient()
  const [betAmount, setBetAmount] = useState('10,00')
  const [liveMultiplierBp, setLiveMultiplierBp] = useState(100)
  const [now, setNow] = useState(() => Date.now())
  const [lastEvent, setLastEvent] = useState<RealtimeEventDto | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const walletQuery = useQuery({
    queryKey: ['wallet', demoPlayer.id],
    queryFn: async () => {
      try {
        return await walletsApi.getMyWallet({ headers: playerHeaders() })
      } catch {
        return walletsApi.createWallet(
          { playerId: demoPlayer.id, username: demoPlayer.username },
          { headers: playerHeaders() },
        )
      }
    },
  })

  const roundQuery = useQuery({
    queryKey: ['round', 'current'],
    queryFn: () => gamesApi.getCurrentRound(),
    refetchInterval: 2_000,
  })

  const historyQuery = useQuery({
    queryKey: ['rounds', 'history'],
    queryFn: () => gamesApi.getRoundHistory(),
  })

  const betsQuery = useQuery({
    queryKey: ['bets', demoPlayer.id],
    queryFn: () => gamesApi.getMyBets({ headers: playerHeaders() }),
  })

  const round = roundQuery.data
  const ownBet = round?.bets.find((bet) => bet.playerId === demoPlayer.id)
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
          username: demoPlayer.username,
        },
        { headers: playerHeaders() },
      )
    },
    onSuccess: async (result) => {
      setNotice(`Aposta reservada: ${formatCents(result.bet.amountCents)}.`)
      await invalidateGameQueries(queryClient)
    },
    onError: (error) => setNotice(getErrorMessage(error)),
  })

  const cashoutMutation = useMutation({
    mutationFn: () => gamesApi.cashout({}, { headers: playerHeaders() }),
    onSuccess: async (result) => {
      setNotice(
        `Cashout em ${formatMultiplier(
          result.bet.cashoutMultiplierBp ?? liveMultiplierBp,
        )}: ${formatCents(result.bet.payoutCents ?? 0)}.`,
      )
      await invalidateGameQueries(queryClient)
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
    const events = new EventSource(realtimeEventsUrl)

    const handleEvent = (message: MessageEvent) => {
      const rawEvent = safeJson(message.data)
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

      void invalidateGameQueries(queryClient)
    }

    for (const type of realtimeTypes) {
      events.addEventListener(type, handleEvent)
    }

    events.onerror = () => {
      setNotice('Stream em tempo real desconectado. Mantendo polling leve.')
    }

    return () => {
      for (const type of realtimeTypes) {
        events.removeEventListener(type, handleEvent)
      }

      events.close()
    }
  }, [queryClient])

  return (
    <section className="game-grid">
      <div className="hero-board">
        <div className="board-copy">
          <div className="eyebrow">Crash engine / fatia vertical</div>
          <h1>{formatMultiplier(liveMultiplierBp)}</h1>
          <p className="lede">
            A rodada sobe em tempo real, a carteira liquida em centavos e o
            hash da seed fica visivel antes do crash.
          </p>
        </div>

        <div className={`phase-orb phase-${phase}`}>
          <span>{phaseLabel(phase)}</span>
          <strong>
            {phase === 'betting'
              ? `${Math.ceil(bettingTimeLeftMs / 1000)}s`
              : formatMultiplier(liveMultiplierBp)}
          </strong>
        </div>

        <div
          className="crash-graph"
          style={{ '--progress': graphProgress } as CSSProperties}
        >
          <div className="graph-grid" />
          <div className="graph-curve" />
          <div className="graph-plane" />
          <div className="graph-floor">
            <span>1.00x</span>
            <span>
              {round?.crashPointBp
                ? formatMultiplier(round.crashPointBp)
                : '???'}
            </span>
          </div>
        </div>

        <div className="seed-strip">
          <span>Server seed hash</span>
          <code>{round?.serverSeedHash ?? 'aguardando rodada'}</code>
        </div>
      </div>

      <aside className="control-stack">
        <div className="wallet-card">
          <span>Jogador</span>
          <strong>{demoPlayer.username}</strong>
          <small>{demoPlayer.id}</small>
          <div className="balance">
            {walletQuery.isLoading
              ? 'Carregando...'
              : formatCents(walletQuery.data?.balanceCents ?? 0)}
          </div>
        </div>

        <form
          className="bet-card"
          onSubmit={(event) => {
            event.preventDefault()
            void placeBetMutation.mutateAsync()
          }}
        >
          <label htmlFor="bet-amount">Valor da aposta</label>
          <div className="money-input">
            <span>R$</span>
            <input
              id="bet-amount"
              inputMode="decimal"
              value={betAmount}
              onChange={(event) => setBetAmount(event.target.value)}
              disabled={placeBetMutation.isPending || phase !== 'betting'}
            />
          </div>
          <button
            className="primary-action"
            disabled={!canBet || placeBetMutation.isPending}
            type="submit"
          >
            {placeBetMutation.isPending ? 'Reservando...' : 'Apostar'}
          </button>
          <button
            className="cashout-action"
            disabled={!canCashout || cashoutMutation.isPending}
            type="button"
            onClick={() => void cashoutMutation.mutateAsync()}
          >
            {cashoutMutation.isPending
              ? 'Sacando...'
              : `Cash out ${formatCents(potentialPayout)}`}
          </button>
          <p>
            {reservedBet
              ? `Sua aposta: ${formatCents(
                  reservedBet.amountCents,
                )} aguardando saque.`
              : 'Aposte na janela de entrada. Depois, so o cashout salva.'}
          </p>
        </form>

        {notice ? <div className="notice">{notice}</div> : null}
      </aside>

      <div className="table-card">
        <div className="section-heading">
          <span>Apostas da rodada</span>
          <strong>{round?.bets.length ?? 0}</strong>
        </div>
        <div className="bet-list">
          {sortedBets.length ? (
            sortedBets.map((bet) => (
              <div className={`bet-row status-${bet.status}`} key={bet.id}>
                <span>{bet.username}</span>
                <strong>{formatCents(bet.amountCents)}</strong>
                <em>{betStatusLabel(bet.status)}</em>
              </div>
            ))
          ) : (
            <p className="empty">Nenhuma aposta nesta rodada ainda.</p>
          )}
        </div>
      </div>

      <div className="history-card">
        <div className="section-heading">
          <span>Historico</span>
          <strong>{historyQuery.data?.length ?? 0}</strong>
        </div>
        <div className="history-list">
          {(historyQuery.data ?? []).map((item) => (
            <span
              className={
                item.crashPointBp >= 200 ? 'history-hot' : 'history-cold'
              }
              key={item.id}
              title={item.serverSeedHash}
            >
              {formatMultiplier(item.crashPointBp)}
            </span>
          ))}
          {!historyQuery.data?.length ? (
            <p className="empty">O primeiro crash ainda esta por vir.</p>
          ) : null}
        </div>
      </div>

      <div className="system-card">
        <div className="section-heading">
          <span>Telemetria</span>
          <strong>{lastEvent?.sequence ?? 0}</strong>
        </div>
        <p>
          Stream:{' '}
          <strong>
            {lastEvent ? eventLabel(lastEvent.type) : 'aguardando evento'}
          </strong>
        </p>
        <p>Round: {round?.id ?? 'carregando'}</p>
        <p>Min/Max: R$ 1,00 / R$ 1.000,00</p>
        <p>Minhas apostas salvas: {betsQuery.data?.length ?? 0}</p>
      </div>
    </section>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})

async function invalidateGameQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['wallet', demoPlayer.id] }),
    queryClient.invalidateQueries({ queryKey: ['round', 'current'] }),
    queryClient.invalidateQueries({ queryKey: ['rounds', 'history'] }),
    queryClient.invalidateQueries({ queryKey: ['bets', demoPlayer.id] }),
  ])
}

function parseMoneyToCents(value: string): number {
  const sanitized = value.trim().replace(/[^\d,.]/g, '').replace(',', '.')
  const [wholeRaw, centsRaw = ''] = sanitized.split('.')
  const whole = wholeRaw ? Number(wholeRaw) : 0
  const cents = Number(centsRaw.padEnd(2, '0').slice(0, 2))

  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(cents)) {
    return 0
  }

  return whole * 100 + cents
}

function isTickPayload(
  payload: unknown,
): payload is { roundId: string; currentMultiplierBp: number } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'currentMultiplierBp' in payload &&
    typeof payload.currentMultiplierBp === 'number'
  )
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response as { data?: { message?: string } } | undefined
    if (response?.data?.message) {
      return response.data.message
    }
  }

  return error instanceof Error ? error.message : 'Operacao nao concluida.'
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function phaseLabel(phase: string): string {
  if (phase === 'betting') {
    return 'Apostas abertas'
  }

  if (phase === 'running') {
    return 'Rodada ativa'
  }

  return 'Crash'
}

function betStatusLabel(status: string): string {
  if (status === 'cashed_out') {
    return 'cashout'
  }

  if (status === 'lost') {
    return 'perdeu'
  }

  return 'ativa'
}

function eventLabel(type: RealtimeEventType): string {
  return type.replace('.', ' / ')
}

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import {
  formatCents,
  formatMultiplier,
  payoutForMultiplier,
  type RealtimeEventDto,
} from '@crash/contracts';
import {
  useBetsQuery,
  useCashoutMutation,
  useHistoryQuery,
  usePlaceBetMutation,
  useRoundQuery,
  useUtil,
  useWalletQuery,
} from '../../../../packages/core/hooks';
import type { PlayerIdentity } from '../../../../packages/core/hooks/auth/oidc';

export default function HomePage({ player }: { player: PlayerIdentity }) {
  const [betAmount, setBetAmount] = useState('10,00');
  const [lastEvent, setLastEvent] = useState<RealtimeEventDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const {
    getErrorMessage,
    parseMoneyToCents,
    phaseLabel,
    betStatusLabel,
    eventLabel,
  } = useUtil();

  const placeBetMutation = usePlaceBetMutation(player);
  const cashoutMutation = useCashoutMutation(player);
  const walletQuery = useWalletQuery(player);
  const betsQuery = useBetsQuery(player);
  const historyQuery = useHistoryQuery();
  const { 
    sortedBets, data: round, ownBet, reservedBet, phase, canCashout, bettingTimeLeftMs, liveMultiplierBp, graphProgress
  } = useRoundQuery(player);

  const parsedBetAmountCents = parseMoneyToCents(betAmount);
  const canBet = phase === 'betting' && !ownBet && parsedBetAmountCents > 0
  const potentialPayout = reservedBet
    ? payoutForMultiplier(reservedBet.amountCents, liveMultiplierBp)
    : payoutForMultiplier(parsedBetAmountCents, liveMultiplierBp);

  return <section className="game-grid">
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
        <strong>{player.username}</strong>
        <small>{player.id}</small>
        <div className="balance">
          {walletQuery.isLoading
            ? 'Carregando...'
            : formatCents(walletQuery.data?.balanceCents ?? 0)}
        </div>
      </div>

      <form
        className="bet-card"
        onSubmit={(event) => {
          event.preventDefault();
          void placeBetMutation.mutateAsync(parsedBetAmountCents)
            .then(async (result) => {
              setNotice(`Aposta reservada: ${formatCents(result.bet.amountCents)}.`);
            })
            .catch((error) => setNotice(getErrorMessage(error)));
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
          onClick={() => void cashoutMutation
            .mutateAsync()
            .then(async result => {
              setNotice(
                `Cashout em ${formatMultiplier(
                  result.bet.cashoutMultiplierBp ?? liveMultiplierBp,
                )}: ${formatCents(result.bet.payoutCents ?? 0)}.`,
              )
            })
            .catch(error => setNotice(getErrorMessage(error)))
          }
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
}
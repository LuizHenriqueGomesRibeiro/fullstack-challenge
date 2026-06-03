import { formatMultiplier, formatCents } from '@crash/contracts';
import HomePageController from './controller';
import {
  HomeTelemetryCard,
  HomeHistoryCard,
  HomeWalletCard,
  HomeBetsTable,
  HomeHeroBoard,
  HomeBetCard,
} from '../../packages/ui';
import { PlayerIdentity } from 'src/packages/core/hooks/auth/oidc';

export default function HomePage({ player }: { player: PlayerIdentity }) {
  const controller = HomePageController(player);
  return <section className="game-grid">
    <HomeHeroBoard
      crashPointLabel={controller.round?.crashPointBp ? formatMultiplier(controller.round.crashPointBp) : '???'}
      serverSeedHashLabel={controller.round?.serverSeedHash ?? 'aguardando rodada'}
      multiplierLabel={formatMultiplier(controller.liveMultiplierBp)}
      phaseLabel={controller.phaseLabel(controller.phase)}
      countdownLabel={controller.countdownLabel}
      graphProgress={controller.graphProgress}
      phase={controller.phase}
    />
    
    <aside className="control-stack">
      <HomeWalletCard
        playerName={player.username}
        playerId={player.id}
        balanceLabel={controller.walletQuery.isLoading
          ? 'Carregando...'
          : formatCents(controller.walletQuery.data?.balanceCents ?? 0)}
      />
      <HomeBetCard
        isInputDisabled={controller.placeBetMutation.isPending || controller.phase !== 'betting'}
        cashoutLabel={`Cash out ${formatCents(controller.potentialPayout)}`}
        isPlaceBetPending={controller.placeBetMutation.isPending}
        isCashoutPending={controller.cashoutMutation.isPending}
        onBetAmountChange={controller.setBetAmount}
        onPlaceBet={controller.handlePlaceBet}
        onCashout={controller.handleCashout}
        canPlaceBet={controller.canBet}
        {...controller}
      />
    </aside>

    <HomeBetsTable
      emptyLabel="Nenhuma aposta nesta rodada ainda."
      count={controller.round?.bets.length ?? 0}
      bets={
        controller.sortedBets.map((bet) => ({
          statusLabel: controller.betStatusLabel(bet.status),
          amountLabel: formatCents(bet.amountCents),
          statusClassName: `status-${bet.status}`,
          username: bet.username,
          id: bet.id,
        }))
      }
    />

    <HomeHistoryCard
      count={controller.historyQuery.data?.length ?? 0}
      emptyLabel="O primeiro crash ainda esta por vir."
      items={(controller.historyQuery.data ?? []).map((item) => ({
        toneClassName: item.crashPointBp >= 200 ? 'history-hot' : 'history-cold',
        label: formatMultiplier(item.crashPointBp),
        title: item.serverSeedHash,
        id: item.id
      }))}
    />

    <HomeTelemetryCard
      betsSavedCount={controller.betsQuery.data?.length ?? 0}
      roundIdLabel={controller.round?.id ?? 'carregando'}
      limitsLabel="R$ 1,00 / R$ 1.000,00"
      streamLabel="aguardando evento"
      sequence={0}
    />

  </section>
}
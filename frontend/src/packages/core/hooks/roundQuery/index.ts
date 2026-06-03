import { queryOptions, useQuery } from "@tanstack/react-query";
import { PlayerIdentity } from "../auth/oidc";
import { gamesApi } from "../../zodios/api";
import { useEffect, useMemo, useState } from "react";
import { payoutForMultiplier } from "@crash/contracts";

export function useRoundQueryOptions() {
  return queryOptions({
    queryKey: ['round', 'current'],
    queryFn: () => gamesApi.getCurrentRound(),
    refetchInterval: 2_000
  });
} 

export default function useRoundQuery(player: PlayerIdentity) {
  const [now, setNow] = useState(() => Date.now());

  const roundQuery = useQuery(
    useRoundQueryOptions()
  );

  const round = roundQuery.data;

  const sortedBets = useMemo(
    () =>
      [...(round?.bets ?? [])].sort((left, right) => {
        if (left.status === right.status) {
          return right.placedAt.localeCompare(left.placedAt)
        }

        return left.status === 'reserved' ? -1 : 1
      }),
    [round?.bets],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, []);

  const ownBet = round?.bets.find((bet) => bet.playerId === player.id);
  const reservedBet = ownBet?.status === 'reserved' ? ownBet : undefined;
  const phase = round?.phase ?? 'betting';
  const canCashout = phase === 'running' && Boolean(reservedBet);
  const bettingTimeLeftMs = round
    ? Math.max(0, Date.parse(round.bettingEndsAt) - now)
    : 0;

  const liveMultiplierBp = round?.currentMultiplierBp ?? 100;

  const graphProgress = Math.min(Math.max((liveMultiplierBp - 100) / 600, 0), 1);

  return {
    phase,
    ownBet,
    sortedBets,
    canCashout,
    reservedBet,
    graphProgress,
    liveMultiplierBp,
    bettingTimeLeftMs,
    ...roundQuery
  }
}
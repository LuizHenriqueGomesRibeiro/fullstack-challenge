import { queryOptions, useQuery } from "@tanstack/react-query";
import { PlayerIdentity } from "../auth/oidc";
import { gamesApi } from "../../zodios/api";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateCrashGraphProgress,
  freezeCrashGraphProgress,
} from "../../utils/crash-graph";

export function useRoundQueryOptions() {
  return queryOptions({
    queryKey: ['round', 'current'],
    queryFn: () => gamesApi.getCurrentRound(),
    refetchInterval: 2_000
  });
} 

export function calculateGraphProgress(liveMultiplierBp: number) {
  return calculateCrashGraphProgress(liveMultiplierBp);
}

function calculateRunningGraphProgress(
  baseProgress: number,
  elapsedMs: number,
) {
  const driftPerMs = 1 / 1000;
  return baseProgress + elapsedMs * driftPerMs;
}

export default function useRoundQuery(player: PlayerIdentity) {
  const [now, setNow] = useState(() => Date.now());
  const [graphProgress, setGraphProgress] = useState(0);
  const graphFrameRef = useRef<number | null>(null);
  const graphStartTimeRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (graphFrameRef.current !== null) {
      window.cancelAnimationFrame(graphFrameRef.current);
      graphFrameRef.current = null;
    }

    if (!round || phase === 'betting') {
      graphStartTimeRef.current = null;
      setGraphProgress(0);
      return;
    }

    const initialProgress = calculateGraphProgress(liveMultiplierBp);
    graphStartTimeRef.current = performance.now();

    if (phase === 'crashed') {
      setGraphProgress((currentProgress) =>
        freezeCrashGraphProgress(currentProgress, liveMultiplierBp),
      );
      return;
    }

    setGraphProgress(initialProgress);

    const step = (frameTime: number) => {
      const startedAt = graphStartTimeRef.current ?? frameTime;
      graphStartTimeRef.current = startedAt;
      const elapsedMs = frameTime - startedAt;
      const nextProgress = calculateRunningGraphProgress(initialProgress, elapsedMs);
      setGraphProgress(nextProgress);
      graphFrameRef.current = window.requestAnimationFrame(step);
    };

    graphFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (graphFrameRef.current !== null) {
        window.cancelAnimationFrame(graphFrameRef.current);
        graphFrameRef.current = null;
      }
    };
  }, [phase, round?.id, round?.startedAt]);

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

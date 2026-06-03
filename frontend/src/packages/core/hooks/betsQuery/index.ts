import { queryOptions, useQuery } from "@tanstack/react-query";
import { gamesApi, playerHeaders } from "../../zodios/api";
import { PlayerIdentity } from "../auth/oidc";

export function useBetsQueryOptions(player: PlayerIdentity) {
  return queryOptions({
    queryKey: ['bets', player.id],
    queryFn: () => gamesApi.getMyBets({ headers: playerHeaders(player) }),
  });
} 

export default function useBetsQuery(player: PlayerIdentity) {
  const betsQuery = useQuery(
    useBetsQueryOptions(player)
  );

  return betsQuery
}
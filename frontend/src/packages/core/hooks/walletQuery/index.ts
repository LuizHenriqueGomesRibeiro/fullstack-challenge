import { queryOptions, useQuery } from "@tanstack/react-query";
import { playerHeaders, walletsApi } from "../../zodios/api";
import { PlayerIdentity } from "../auth/oidc";

function walletQueryOptions(player: PlayerIdentity) {
  return queryOptions({
    queryKey: ['wallet', player.id],
    queryFn: async () => {
      try {
        return await walletsApi.getMyWallet({ headers: playerHeaders(player) })
      } catch {
        return walletsApi.createWallet(
          { username: player.username },
          { headers: playerHeaders(player) },
        )
      }
    },
  })
}

export default function useWalletQuery(player: PlayerIdentity) {
  const walletQuery = useQuery(
    walletQueryOptions(player)
  );

  return walletQuery
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gamesApi, playerHeaders } from "../../zodios/api";
import { PlayerIdentity } from "../auth/oidc";
import useUtil from "../util";

export default function useCashoutMutation(player: PlayerIdentity) {
  const queryClient = useQueryClient();
  const {
    invalidateGameQueries,
  } = useUtil();

  const cashoutMutation = useMutation({
    mutationFn: () => gamesApi.cashout({}, { headers: playerHeaders(player) }),
    onSuccess: async () => {
      await invalidateGameQueries(queryClient, player.id)
    },
  });

  return cashoutMutation;
}
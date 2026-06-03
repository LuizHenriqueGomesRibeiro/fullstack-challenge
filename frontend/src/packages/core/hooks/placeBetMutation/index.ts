import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gamesApi, playerHeaders } from "../../zodios/api";
import { PlayerIdentity } from "../auth/oidc";
import useUtil from "../util";

export default function usePlaceBetMutation(player: PlayerIdentity) {
  const queryClient = useQueryClient();
  const {
    invalidateGameQueries,
  } = useUtil();

  const placeBetMutation = useMutation({
    mutationFn: async (parsedBetAmountCents: number) => {
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
    onSuccess: async () => {
      await invalidateGameQueries(queryClient, player.id)
    }
  });

  return placeBetMutation;
}
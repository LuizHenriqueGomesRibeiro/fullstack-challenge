import { 
  useBetsQuery, 
  useCashoutMutation, 
  useHistoryQuery, 
  usePlaceBetMutation, 
  useRoundQuery, 
  useUtil, 
  useWalletQuery 
} from "src/packages/core/hooks";
import { formatCents, formatMultiplier, payoutForMultiplier } from "@crash/contracts";
import { PlayerIdentity } from "src/packages/core/hooks/auth/oidc";
import { useState } from "react";

export default function useHomePageController(player: PlayerIdentity) {
  const [betAmount, setBetAmount] = useState('10,00');
  const [notice, setNotice] = useState<string | null>(null);
  const {
    parseMoneyToCents,
    getErrorMessage,
    ...util
  } = useUtil();

  const placeBetMutation = usePlaceBetMutation(player);
  const cashoutMutation = useCashoutMutation(player);
  const walletQuery = useWalletQuery(player);
  const betsQuery = useBetsQuery(player);
  const historyQuery = useHistoryQuery();
  const {
    sortedBets,
    data: round,
    ownBet,
    reservedBet,
    phase,
    canCashout,
    bettingTimeLeftMs,
    liveMultiplierBp,
    graphProgress,
  } = useRoundQuery(player);
  
  const parsedBetAmountCents = parseMoneyToCents(betAmount);
  const canBet = phase === 'betting' && !ownBet && parsedBetAmountCents > 0;
  const potentialPayout = reservedBet
    ? payoutForMultiplier(reservedBet.amountCents, liveMultiplierBp)
    : payoutForMultiplier(parsedBetAmountCents, liveMultiplierBp);

  const countdownLabel =
    phase === 'betting'
      ? `${Math.ceil(bettingTimeLeftMs / 1000)}s`
      : formatMultiplier(liveMultiplierBp);

  const reservationMessage = reservedBet
    ? `Sua aposta: ${formatCents(reservedBet.amountCents)} aguardando saque.`
    : 'Aposte na janela de entrada. Depois, so o cashout salva.';

  function handleCashout() {
    void cashoutMutation
      .mutateAsync()
      .then((result) => {
        setNotice(
          `Cashout em ${formatMultiplier(
            result.bet.cashoutMultiplierBp ?? liveMultiplierBp,
          )}: ${formatCents(result.bet.payoutCents ?? 0)}.`,
        );
      })
      .catch((error) => setNotice(
        getErrorMessage(error)
      )
    );
  }

  function handlePlaceBet() {
    void placeBetMutation
      .mutateAsync(parsedBetAmountCents)
      .then((result) => {
        setNotice(
          `Aposta reservada: ${formatCents(result.bet.amountCents)}.`,
        );
      })
      .catch((error) => setNotice(
        getErrorMessage(error))
      );
  }
  
  return {
    parsedBetAmountCents,
    reservationMessage,
    placeBetMutation,
    liveMultiplierBp,
    cashoutMutation,
    potentialPayout,
    countdownLabel,
    graphProgress,
    historyQuery,
    walletQuery,
    sortedBets,
    canCashout,
    betsQuery,
    betAmount,
    canBet,
    notice,
    round,
    phase,
    handlePlaceBet,
    handleCashout,
    setBetAmount,
    setNotice,
    ...util
  }
}
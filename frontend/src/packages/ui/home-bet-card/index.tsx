type HomeBetCardProps = {
  betAmount: string;
  canPlaceBet: boolean;
  canCashout: boolean;
  cashoutLabel: string;
  isInputDisabled: boolean;
  isPlaceBetPending: boolean;
  isCashoutPending: boolean;
  notice: string | null;
  reservationMessage: string;
  onBetAmountChange: (value: string) => void;
  onPlaceBet: () => void;
  onCashout: () => void;
};

export default function HomeBetCard({
  betAmount,
  canPlaceBet,
  canCashout,
  cashoutLabel,
  isInputDisabled,
  isPlaceBetPending,
  isCashoutPending,
  notice,
  reservationMessage,
  onBetAmountChange,
  onPlaceBet,
  onCashout,
}: HomeBetCardProps) {
  return (
    <>
      <form
        className="bet-card"
        onSubmit={(event) => {
          event.preventDefault();
          onPlaceBet();
        }}
      >
        <label htmlFor="bet-amount">Valor da aposta</label>
        <div className="money-input">
          <span>R$</span>
          <input
            id="bet-amount"
            inputMode="decimal"
            value={betAmount}
            onChange={(event) => onBetAmountChange(event.target.value)}
            disabled={isInputDisabled}
          />
        </div>
        <button
          className="primary-action"
          disabled={!canPlaceBet || isPlaceBetPending}
          type="submit"
        >
          {isPlaceBetPending ? 'Reservando...' : 'Apostar'}
        </button>
        <button
          className="cashout-action"
          disabled={!canCashout || isCashoutPending}
          type="button"
          onClick={onCashout}
        >
          {isCashoutPending ? 'Sacando...' : cashoutLabel}
        </button>
        <p>{reservationMessage}</p>
      </form>

      {notice ? <div className="notice">{notice}</div> : null}
    </>
  );
}

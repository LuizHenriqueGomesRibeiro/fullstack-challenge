type HomeBetRow = {
  amountLabel: string;
  id: string;
  statusClassName: string;
  statusLabel: string;
  username: string;
};

type HomeBetsTableProps = {
  bets: HomeBetRow[];
  count: number;
  emptyLabel: string;
};

export default function HomeBetsTable({
  bets,
  count,
  emptyLabel,
}: HomeBetsTableProps) {
  return (
    <div className="table-card">
      <div className="section-heading">
        <span>Apostas da rodada</span>
        <strong>{count}</strong>
      </div>
      <div className="bet-list">
        {bets.length ? (
          bets.map((bet) => (
            <div className={`bet-row ${bet.statusClassName}`} key={bet.id}>
              <span>{bet.username}</span>
              <strong>{bet.amountLabel}</strong>
              <em>{bet.statusLabel}</em>
            </div>
          ))
        ) : (
          <p className="empty">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

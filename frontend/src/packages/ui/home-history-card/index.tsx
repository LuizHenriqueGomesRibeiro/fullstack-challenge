type HomeHistoryItem = {
  id: string;
  label: string;
  title: string;
  toneClassName: string;
};

type HomeHistoryCardProps = {
  count: number;
  emptyLabel: string;
  items: HomeHistoryItem[];
};

export default function HomeHistoryCard({
  count,
  emptyLabel,
  items,
}: HomeHistoryCardProps) {
  return (
    <div className="history-card">
      <div className="section-heading">
        <span>Historico</span>
        <strong>{count}</strong>
      </div>
      <div className="history-list">
        {items.map((item) => (
          <span
            className={item.toneClassName}
            key={item.id}
            title={item.title}
          >
            {item.label}
          </span>
        ))}
        {!items.length ? <p className="empty">{emptyLabel}</p> : null}
      </div>
    </div>
  );
}

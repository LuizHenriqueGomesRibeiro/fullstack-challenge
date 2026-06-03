type HomeWalletCardProps = {
  playerName: string;
  playerId: string;
  balanceLabel: string;
};

export default function HomeWalletCard({
  playerName,
  playerId,
  balanceLabel,
}: HomeWalletCardProps) {
  return (
    <div className="wallet-card">
      <span>Jogador</span>
      <strong>{playerName}</strong>
      <small>{playerId}</small>
      <div className="balance">{balanceLabel}</div>
    </div>
  );
}

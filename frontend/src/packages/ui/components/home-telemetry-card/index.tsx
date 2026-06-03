type HomeTelemetryCardProps = {
  betsSavedCount: number;
  limitsLabel: string;
  roundIdLabel: string;
  sequence: number;
  streamLabel: string;
};

export default function HomeTelemetryCard({
  betsSavedCount,
  limitsLabel,
  roundIdLabel,
  sequence,
  streamLabel,
}: HomeTelemetryCardProps) {
  return (
    <div className="system-card">
      <div className="section-heading">
        <span>Telemetria</span>
        <strong>{sequence}</strong>
      </div>
      <p>
        Stream: <strong>{streamLabel}</strong>
      </p>
      <p>Round: {roundIdLabel}</p>
      <p>Min/Max: {limitsLabel}</p>
      <p>Minhas apostas salvas: {betsSavedCount}</p>
    </div>
  );
}

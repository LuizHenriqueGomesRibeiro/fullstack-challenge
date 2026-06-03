import type { CSSProperties } from 'react';

type HomeHeroBoardProps = {
  multiplierLabel: string;
  phase: string;
  phaseLabel: string;
  countdownLabel: string;
  crashPointLabel: string;
  serverSeedHashLabel: string;
  graphProgress: number;
};

export default function HomeHeroBoard({
  multiplierLabel,
  phase,
  phaseLabel,
  countdownLabel,
  crashPointLabel,
  serverSeedHashLabel,
  graphProgress,
}: HomeHeroBoardProps) {
  return (
    <div className="hero-board">
      <div className="board-copy">
        <div className="eyebrow">Crash engine / fatia vertical</div>
        <h1>{multiplierLabel}</h1>
        <p className="lede">
          A rodada sobe em tempo real, a carteira liquida em centavos e o hash
          da seed fica visivel antes do crash.
        </p>
      </div>

      <div className={`phase-orb phase-${phase}`}>
        <span>{phaseLabel}</span>
        <strong>{countdownLabel}</strong>
      </div>

      <div
        className="crash-graph"
        style={{ '--progress': graphProgress } as CSSProperties}
      >
        <div className="graph-grid" />
        <div className="graph-curve" />
        <div className="graph-plane" />
        <div className="graph-floor">
          <span>1.00x</span>
          <span>{crashPointLabel}</span>
        </div>
      </div>

      <div className="seed-strip">
        <span>Server seed hash</span>
        <code>{serverSeedHashLabel}</code>
      </div>
    </div>
  );
}

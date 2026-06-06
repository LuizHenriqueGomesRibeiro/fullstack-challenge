import CrashGraphSvg from "../crash-graph-svg";
import { HomeHeroBoardProps } from "../home-hero-board";

export default function HomeHeroBoardContent({
  multiplierLabel,
  phase,
  phaseLabel,
  countdownLabel,
  crashDurationLabel,
  crashPointLabel,
  serverSeedHashLabel,
}: Omit<HomeHeroBoardProps, 'multiplierBp' | 'graphProgress'>) {
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

      <CrashGraphSvg
        multiplierLabel={multiplierLabel}
        crashPointLabel={crashPointLabel}
        crashDurationLabel={crashDurationLabel}
      />

      <div className="seed-strip">
        <span>Server seed hash</span>
        <code>{serverSeedHashLabel}</code>
      </div>
    </div>
  );
}
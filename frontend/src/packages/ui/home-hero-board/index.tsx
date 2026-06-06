import {
  CrashGraphProvider,
} from './crash-graph-context';
import HomeHeroBoardContent from '../home-hero-board-content';

export type HomeHeroBoardProps = {
  multiplierLabel: string;
  multiplierBp: number;
  phase: string;
  phaseLabel: string;
  countdownLabel: string;
  crashDurationLabel: string;
  crashPointLabel: string;
  serverSeedHashLabel: string;
  graphProgress: number;
};

export default function HomeHeroBoard({
  multiplierLabel,
  multiplierBp,
  phase,
  phaseLabel,
  countdownLabel,
  crashDurationLabel,
  crashPointLabel,
  serverSeedHashLabel,
  graphProgress,
}: HomeHeroBoardProps) {
  return (
    <CrashGraphProvider
      graphProgress={graphProgress}
      multiplierBp={multiplierBp}
      phase={phase}
    >
      <HomeHeroBoardContent
        crashPointLabel={crashPointLabel}
        countdownLabel={countdownLabel}
        crashDurationLabel={crashDurationLabel}
        multiplierLabel={multiplierLabel}
        phase={phase}
        phaseLabel={phaseLabel}
        serverSeedHashLabel={serverSeedHashLabel}
      />
    </CrashGraphProvider>
  );
}
import { animated } from '@react-spring/web';
import {
  CrashGraphProvider,
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  PLOT,
  baselineStartX,
  floorY,
  plotWidth,
  useCrashGraph,
} from './crash-graph-context';

type HomeHeroBoardProps = {
  multiplierLabel: string;
  multiplierBp: number;
  phase: string;
  phaseLabel: string;
  countdownLabel: string;
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
        multiplierLabel={multiplierLabel}
        phase={phase}
        phaseLabel={phaseLabel}
        serverSeedHashLabel={serverSeedHashLabel}
      />
    </CrashGraphProvider>
  );
}

function HomeHeroBoardContent({
  multiplierLabel,
  phase,
  phaseLabel,
  countdownLabel,
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
      />

      <div className="seed-strip">
        <span>Server seed hash</span>
        <code>{serverSeedHashLabel}</code>
      </div>
    </div>
  );
}

function CrashGraphSvg({
  multiplierLabel,
  crashPointLabel,
}: {
  multiplierLabel: string;
  crashPointLabel: string;
}) {
  const {
    areaGradientId,
    curveGradientId,
    impactGradientId,
    markerGradientId,
    phase,
    plot,
    xAxisTicks,
    yAxisTicks,
    visual,
  } = useCrashGraph();

  return (
    <div className="crash-graph" data-phase={phase}>
      <svg
        aria-label={`Curva do multiplicador ${multiplierLabel}`}
        className="crash-graph-svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      >
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={curveGradientId}
            x1={baselineStartX}
            x2={GRAPH_WIDTH - PLOT.right}
            y1={floorY}
            y2={PLOT.top}
          >
            <stop offset="0" stopColor="var(--green)" />
            <stop offset="0.5" stopColor="var(--gold)" />
            <stop offset="1" stopColor="var(--red)" />
          </linearGradient>

          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={areaGradientId}
            x1="0"
            x2="0"
            y1={PLOT.top}
            y2={floorY}
          >
            <stop offset="0" stopColor="var(--red)" stopOpacity="0.26" />
            <stop offset="0.44" stopColor="var(--gold)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>

          <linearGradient
            id={markerGradientId}
            x1="0"
            x2="1"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#fff9d8" />
            <stop offset="0.45" stopColor="var(--gold)" />
            <stop offset="1" stopColor="var(--graph-accent)" />
          </linearGradient>

          <radialGradient id={impactGradientId}>
            <stop offset="0" stopColor="#fff9d8" stopOpacity="0.72" />
            <stop offset="0.45" stopColor="var(--red)" stopOpacity="0.34" />
            <stop offset="1" stopColor="var(--red)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="graph-y-axis" aria-hidden="true">
          {yAxisTicks.map((tick) => (
            <g className="graph-y-axis-row" key={tick.label}>
              <line
                className="graph-y-axis-guide"
                x1={PLOT.left}
                x2={PLOT.left + plotWidth}
                y1={tick.y}
                y2={tick.y}
              />
              <line
                className="graph-y-axis-tick"
                x1={PLOT.left - 6}
                x2={PLOT.left + 6}
                y1={tick.y}
                y2={tick.y}
              />
              <text
                className="graph-y-axis-label"
                textAnchor="end"
                x={PLOT.left - 12}
                y={tick.y + 4}
              >
                {tick.label}
              </text>
            </g>
          ))}
          <line
            className="graph-y-axis-line"
            x1={PLOT.left}
            x2={PLOT.left}
            y1={PLOT.top}
            y2={floorY}
          />
        </g>

        <g className="graph-x-axis" aria-hidden="true">
          <line
            className="graph-x-axis-line"
            x1={PLOT.left}
            x2={PLOT.left + plotWidth}
            y1={floorY}
            y2={floorY}
          />
          {xAxisTicks.map((tick) => (
            <g className="graph-x-axis-row" key={tick.label}>
              <line
                className="graph-x-axis-tick"
                x1={tick.x}
                x2={tick.x}
                y1={floorY}
                y2={floorY + 7}
              />
              <text
                className="graph-x-axis-label"
                textAnchor="middle"
                x={tick.x}
                y={floorY + 24}
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        <animated.g className="graph-stage" transform={plot.stageTransform}>
          <animated.path
            className="graph-area"
            d={plot.areaPath}
            fill={`url(#${areaGradientId})`}
            opacity={visual.areaOpacity}
          />

          <animated.path
            className="graph-curve-shadow"
            d={plot.curvePath}
            opacity={visual.shadowOpacity}
            stroke={`url(#${curveGradientId})`}
          />

          <animated.path
            className="graph-curve"
            d={plot.curvePath}
            opacity={visual.curveOpacity}
            stroke={`url(#${curveGradientId})`}
          />

          <animated.path
            className="graph-flow"
            d={plot.curvePath}
            opacity={visual.flowOpacity}
          />

          <animated.line
            className="graph-crash-line"
            opacity={visual.crashLineOpacity}
            x1={plot.markerX}
            x2={plot.markerX}
            y1={PLOT.top}
            y2={floorY}
          />

          <animated.circle
            className="graph-impact-ring"
            cx={plot.markerX}
            cy={plot.markerY}
            fill={`url(#${impactGradientId})`}
            opacity={visual.impactOpacity}
            r={plot.impactRadius}
          />

          <animated.circle
            className="graph-start-point"
            cx={plot.markerX}
            cy={plot.markerY}
            opacity={visual.startPointOpacity}
            r="7"
          />

          <animated.g
            className="graph-sparks"
            opacity={visual.sparkOpacity}
            transform={plot.sparkTransform}
          >
            <circle className="graph-spark graph-spark-a" cx="-18" cy="14" r="3" />
            <circle className="graph-spark graph-spark-b" cx="-7" cy="-18" r="2.5" />
            <circle className="graph-spark graph-spark-c" cx="15" cy="10" r="2.5" />
          </animated.g>

          <animated.text
            className="graph-marker-label"
            opacity={visual.labelOpacity}
            x={plot.labelX}
            y={plot.labelY}
          >
            {multiplierLabel}
          </animated.text>

          <animated.g
            className="graph-marker"
            opacity={visual.markerOpacity}
            transform={plot.markerTransform}
          >
            <circle className="graph-marker-halo" cx="0" cy="0" r="18" />
            <path
              className="graph-marker-tail"
              d="M -34 -8 L -7 -3 L -7 3 L -34 8 Z"
              fill={`url(#${markerGradientId})`}
            />
            <path
              className="graph-marker-body"
              d="M -13 -10 L 20 0 L -13 10 L -5 0 Z"
              fill={`url(#${markerGradientId})`}
            />
            <circle className="graph-marker-core" cx="0" cy="0" r="4" />
          </animated.g>
        </animated.g>
      </svg>

      <div className="graph-floor">
        <span>tempo até 10x</span>
        <span>{crashPointLabel} · 3.75s</span>
      </div>
    </div>
  );
}

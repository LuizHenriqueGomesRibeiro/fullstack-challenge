import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  type PropsWithChildren,
} from 'react';
import {
  to,
  type Interpolation,
  type SpringConfig,
  type SpringValue,
  type SpringValues,
  useReducedMotion,
  useSpring,
  useSpringValue,
} from '@react-spring/web';

export const GRAPH_WIDTH = 720;
export const GRAPH_HEIGHT = 280;
export const PLOT = {
  left: 60,
  right: 42,
  top: 24,
  bottom: 42,
};

export const plotWidth = GRAPH_WIDTH - PLOT.left - PLOT.right;
export const plotHeight = GRAPH_HEIGHT - PLOT.top - PLOT.bottom;
export const floorY = GRAPH_HEIGHT - PLOT.bottom;
export const baselineStartX = PLOT.left;
export const Y_AXIS_TICKS = [
  { label: '10x', y: PLOT.top + 2 },
  { label: '5x', y: PLOT.top + plotHeight * 0.32 },
  { label: '2x', y: PLOT.top + plotHeight * 0.66 },
  { label: '1x', y: floorY },
];

export type CrashGraphPhase = 'betting' | 'running' | 'crashed';

export type CrashCurvePlot = {
  areaPath: string;
  curvePath: string;
  markerX: number;
  markerY: number;
  markerAngle: number;
  labelX: number;
  labelY: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  controlOneX: number;
  controlOneY: number;
  controlTwoX: number;
  controlTwoY: number;
};

type CrashGraphVisualState = {
  areaOpacity: number;
  curveOpacity: number;
  shadowOpacity: number;
  flowOpacity: number;
  sparkOpacity: number;
  crashLineOpacity: number;
  startPointOpacity: number;
  markerOpacity: number;
  labelOpacity: number;
  markerScale: number;
  impactOpacity: number;
  impactScale: number;
  shakeX: number;
  shakeY: number;
};

type CrashGraphAnimatedPlot = {
  areaPath: Interpolation;
  curvePath: Interpolation;
  markerX: Interpolation;
  markerY: Interpolation;
  markerAngle: Interpolation;
  labelX: Interpolation;
  labelY: Interpolation;
  markerTransform: Interpolation;
  sparkTransform: Interpolation;
  stageTransform: Interpolation;
  impactRadius: Interpolation;
};

type CrashGraphContextValue = {
  phase: CrashGraphPhase;
  progress: SpringValue<number>;
  visual: SpringValues<CrashGraphVisualState>;
  plot: CrashGraphAnimatedPlot;
  curveGradientId: string;
  areaGradientId: string;
  markerGradientId: string;
  impactGradientId: string;
  referenceCurvePath: string;
  reducedMotion: boolean;
};

const CrashGraphContext = createContext<CrashGraphContextValue | null>(null);

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function point(value: number) {
  return value.toFixed(2);
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number) {
  const amount = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function normalizeCrashGraphPhase(phase: string): CrashGraphPhase {
  if (phase === 'running' || phase === 'crashed') return phase;
  return 'betting';
}

function multiplierProgress(multiplierBp: number) {
  const multiplier = Math.max(1, multiplierBp / 100);
  return clamp(Math.log(multiplier) / Math.log(10), 0, 1);
}

export function resolveCrashGraphProgress(
  graphProgress: number,
  multiplierBp: number,
  phase: string,
) {
  const graphPhase = normalizeCrashGraphPhase(phase);
  const normalizedProgress = clamp(graphProgress, 0, 1);
  const multiplierLift = multiplierProgress(multiplierBp);

  if (graphPhase === 'betting') {
    return 0;
  }

  const liveProgress = Math.max(normalizedProgress, multiplierLift * 0.9);

  if (graphPhase === 'crashed') {
    return clamp(Math.max(liveProgress, 0.16), 0.12, 1);
  }

  return clamp(Math.max(liveProgress, 0.05), 0.05, 1);
}

export function buildCrashCurvePlot(
  progress: number,
  multiplierBp: number,
  phase: CrashGraphPhase,
): CrashCurvePlot {
  const normalizedProgress = clamp(progress, 0, 1);
  const isBetting = phase === 'betting';
  const multiplierLift = multiplierProgress(multiplierBp);

  if (isBetting) {
    const startX = baselineStartX;
    const startY = floorY;
    const curvePath = [
      `M ${point(startX)} ${point(startY)}`,
      `C ${point(startX)} ${point(startY)}`,
      `${point(startX)} ${point(startY)}`,
      `${point(startX)} ${point(startY)}`,
    ].join(' ');

    return {
      areaPath: `${curvePath} Z`,
      curvePath,
      markerX: startX,
      markerY: startY,
      markerAngle: 0,
      labelX: startX + 18,
      labelY: startY - 18,
      startX,
      startY,
      endX: startX,
      endY: startY,
      controlOneX: startX,
      controlOneY: startY,
      controlTwoX: startX,
      controlTwoY: startY,
    };
  }

  const visualProgress = isBetting
    ? clamp(normalizedProgress, 0.08, 0.22)
    : clamp(Math.max(normalizedProgress, multiplierLift * 0.86, 0.045), 0.045, 1);
  const heat = smoothstep(0.12, 0.92, visualProgress);
  const verticality = smoothstep(0.3, 0.96, visualProgress);
  const horizontalProgress = isBetting
    ? visualProgress * 0.72
    : clamp(Math.pow(visualProgress, 0.72) - verticality * 0.035, 0.05, 1);
  const endpointLift = isBetting
    ? clamp(0.028 + visualProgress * 0.065, 0.032, 0.05)
    : clamp(
        0.026 + Math.pow(visualProgress, 1.72) * 0.86 + multiplierLift * 0.105,
        0.048,
        phase === 'crashed' ? 0.98 : 0.94,
      );

  const startX = baselineStartX;
  const startY = floorY;
  const endX = startX + plotWidth * horizontalProgress;
  const endY = floorY - plotHeight * endpointLift;
  const dx = endX - startX;
  const liftPx = startY - endY;
  const steepness = smoothstep(0.24, 0.88, endpointLift);
  const firstHandleLift = clamp(liftPx * (0.018 + heat * 0.035), 2, 22);
  const secondHandleDrop = clamp(liftPx * (0.46 - steepness * 0.22) + 12, 22, 116);
  const secondHandleReach = Math.max(12, dx * (0.22 - steepness * 0.17));
  const controlOneX = startX + dx * (0.34 + (1 - heat) * 0.06);
  const controlOneY = startY - firstHandleLift;
  const controlTwoX = endX - secondHandleReach;
  const controlTwoY = endY + secondHandleDrop;
  const curvePath = [
    `M ${point(startX)} ${point(startY)}`,
    `C ${point(controlOneX)} ${point(controlOneY)}`,
    `${point(controlTwoX)} ${point(controlTwoY)}`,
    `${point(endX)} ${point(endY)}`,
  ].join(' ');
  const markerAngle =
    (Math.atan2(endY - controlTwoY, endX - controlTwoX) * 180) / Math.PI;

  return {
    areaPath: `${curvePath} L ${point(endX)} ${point(floorY)} L ${point(startX)} ${point(floorY)} Z`,
    curvePath,
    markerX: endX,
    markerY: endY,
    markerAngle: clamp(markerAngle, -76, -8),
    labelX: clamp(endX + 18, PLOT.left + 72, GRAPH_WIDTH - 92),
    labelY: clamp(endY - 18, PLOT.top + 22, floorY - 22),
    startX,
    startY,
    endX,
    endY,
    controlOneX,
    controlOneY,
    controlTwoX,
    controlTwoY,
  };
}

export function buildReferenceCurvePath() {
  return [
    `M ${point(baselineStartX)} ${point(floorY)}`,
    `C ${point(baselineStartX + plotWidth * 0.38)} ${point(floorY - 3)}`,
    `${point(baselineStartX + plotWidth * 0.82)} ${point(PLOT.top + plotHeight * 0.72)}`,
    `${point(baselineStartX + plotWidth)} ${point(PLOT.top + 9)}`,
  ].join(' ');
}

function progressSpringConfig(
  phase: CrashGraphPhase,
  targetProgress: number,
): SpringConfig {
  if (phase === 'betting') {
    return { tension: 92, friction: 24, precision: 0.0008, clamp: true };
  }

  if (phase === 'crashed') {
    return { tension: 340, friction: 34, precision: 0.0005, clamp: true };
  }

  return {
    tension: 132 + targetProgress * 150,
    friction: 22 + targetProgress * 6,
    precision: 0.0004,
  };
}

function phaseVisualTarget(phase: CrashGraphPhase): CrashGraphVisualState {
  if (phase === 'betting') {
    return {
      areaOpacity: 0,
      curveOpacity: 0,
      shadowOpacity: 0,
      flowOpacity: 0,
      sparkOpacity: 0,
      crashLineOpacity: 0,
      startPointOpacity: 1,
      markerOpacity: 0,
      labelOpacity: 0,
      markerScale: 0.9,
      impactOpacity: 0,
      impactScale: 0.7,
      shakeX: 0,
      shakeY: 0,
    };
  }

  if (phase === 'crashed') {
    return {
      areaOpacity: 0.38,
      curveOpacity: 0.95,
      shadowOpacity: 0.78,
      flowOpacity: 0,
      sparkOpacity: 0,
      crashLineOpacity: 1,
      startPointOpacity: 0,
      markerOpacity: 0.95,
      labelOpacity: 0.95,
      markerScale: 1,
      impactOpacity: 0,
      impactScale: 1.7,
      shakeX: 0,
      shakeY: 0,
    };
  }

  return {
    areaOpacity: 0.88,
    curveOpacity: 1,
    shadowOpacity: 0.74,
    flowOpacity: 0.92,
    sparkOpacity: 1,
    crashLineOpacity: 0,
    startPointOpacity: 0,
    markerOpacity: 1,
    labelOpacity: 1,
    markerScale: 1,
    impactOpacity: 0,
    impactScale: 0.8,
    shakeX: 0,
    shakeY: 0,
  };
}

export function useCrashGraph() {
  const context = useContext(CrashGraphContext);

  if (!context) {
    throw new Error('useCrashGraph must be used within CrashGraphProvider');
  }

  return context;
}

type CrashGraphProviderProps = PropsWithChildren<{
  multiplierBp: number;
  phase: string;
  graphProgress: number;
}>;

export function CrashGraphProvider({
  children,
  multiplierBp,
  phase,
  graphProgress,
}: CrashGraphProviderProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const graphPhase = normalizeCrashGraphPhase(phase);
  const reducedMotion = Boolean(useReducedMotion());
  const targetProgress = resolveCrashGraphProgress(
    graphProgress,
    multiplierBp,
    graphPhase,
  );
  const progress = useSpringValue(targetProgress, {
    config: progressSpringConfig(graphPhase, targetProgress),
    immediate: reducedMotion,
  });
  const [visual, visualApi] = useSpring(() => phaseVisualTarget(graphPhase));
  const referenceCurvePath = useMemo(() => buildReferenceCurvePath(), []);
  const curveGradientId = `${reactId}-crash-curve`;
  const areaGradientId = `${reactId}-crash-area`;
  const markerGradientId = `${reactId}-crash-marker`;
  const impactGradientId = `${reactId}-crash-impact`;

  useEffect(() => {
    if (reducedMotion) {
      progress.stop();
      progress.set(targetProgress);
      return;
    }

    void progress.start({
      to: targetProgress,
      config: progressSpringConfig(graphPhase, targetProgress),
    });
  }, [graphPhase, progress, reducedMotion, targetProgress]);

  useEffect(() => {
    const target = phaseVisualTarget(graphPhase);

    if (reducedMotion) {
      void visualApi.start({
        ...target,
        impactOpacity: 0,
        shakeX: 0,
        shakeY: 0,
        immediate: true,
      });
      return;
    }

    if (graphPhase === 'crashed') {
      void visualApi.start({
        from: {
          ...target,
          crashLineOpacity: 0,
          impactOpacity: 0,
          impactScale: 0.58,
          markerScale: 1,
        },
        to: async (next) => {
          await next({
            ...target,
            crashLineOpacity: 1,
            impactOpacity: 0.92,
            impactScale: 1.08,
            markerScale: 1.18,
            sparkOpacity: 0.92,
            shakeX: -5,
            shakeY: 2,
            config: { duration: 80 },
          });
          await next({
            ...target,
            impactOpacity: 0.34,
            impactScale: 1.42,
            markerScale: 0.96,
            sparkOpacity: 0.38,
            shakeX: 4,
            shakeY: -1,
            config: { duration: 95 },
          });
          await next({
            ...target,
            impactOpacity: 0,
            impactScale: 1.82,
            markerScale: 1,
            shakeX: 0,
            shakeY: 0,
            config: { tension: 220, friction: 26 },
          });
        },
      });
      return;
    }

    void visualApi.start({
      ...target,
      config:
        graphPhase === 'betting'
          ? { tension: 118, friction: 24 }
          : { tension: 176, friction: 22 },
    });
  }, [graphPhase, reducedMotion, visualApi]);

  const animatedPlot = useMemo(
    () =>
      progress.to((currentProgress) =>
        buildCrashCurvePlot(currentProgress, multiplierBp, graphPhase),
      ),
    [graphPhase, multiplierBp, progress],
  );

  const plot = useMemo<CrashGraphAnimatedPlot>(() => {
    const markerX = animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.markerX);
    const markerY = animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.markerY);
    const markerAngle = animatedPlot.to(
      (currentPlot: CrashCurvePlot) => currentPlot.markerAngle,
    );

    return {
      areaPath: animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.areaPath),
      curvePath: animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.curvePath),
      markerX,
      markerY,
      markerAngle,
      labelX: animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.labelX),
      labelY: animatedPlot.to((currentPlot: CrashCurvePlot) => currentPlot.labelY),
      markerTransform: to(
        [markerX, markerY, markerAngle, visual.markerScale],
        (x, y, angle, scale) =>
          `translate(${point(x)} ${point(y)}) rotate(${point(angle)}) scale(${point(scale)})`,
      ),
      sparkTransform: to(
        [markerX, markerY],
        (x, y) => `translate(${point(x)} ${point(y)})`,
      ),
      stageTransform: to(
        [visual.shakeX, visual.shakeY],
        (x, y) => `translate(${point(x)} ${point(y)})`,
      ),
      impactRadius: visual.impactScale.to((scale) => 22 + scale * 34),
    };
  }, [animatedPlot, visual.impactScale, visual.markerScale, visual.shakeX, visual.shakeY]);

  const value = useMemo<CrashGraphContextValue>(
    () => ({
      phase: graphPhase,
      progress,
      visual,
      plot,
      curveGradientId,
      areaGradientId,
      markerGradientId,
      impactGradientId,
      referenceCurvePath,
      reducedMotion,
    }),
    [
      areaGradientId,
      curveGradientId,
      graphPhase,
      impactGradientId,
      markerGradientId,
      plot,
      progress,
      reducedMotion,
      referenceCurvePath,
      visual,
    ],
  );

  return (
    <CrashGraphContext.Provider value={value}>
      {children}
    </CrashGraphContext.Provider>
  );
}

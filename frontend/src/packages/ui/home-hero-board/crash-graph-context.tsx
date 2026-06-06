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
import {
  getCrashGraphAxisMaxMultiplierBp,
  getCrashGraphYAxisTickValues,
  exponentialCurveProgress,
  scaleCrashGraphMultiplier,
} from '../../core/utils/crash-graph';

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
  yAxisTicks: Array<{ label: string; y: number }>;
  curveGradientId: string;
  areaGradientId: string;
  markerGradientId: string;
  impactGradientId: string;
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

function exponentialEase(value: number, strength = 4.2) {
  const normalized = Math.max(value, 0);
  if (normalized === 0) return 0;

  return 1 - Math.exp(-strength * normalized);
}

function buildExponentialCurvePath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  segments = 72,
) {
  const points: string[] = [];
  const step = Math.max(2, segments);

  for (let index = 0; index <= step; index += 1) {
    const t = index / step;
    const eased = exponentialCurveProgress(t);
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * eased;
    points.push(`${index === 0 ? 'M' : 'L'} ${point(x)} ${point(y)}`);
  }

  return points.join(' ');
}

export function buildYAxisTicks(axisMaxMultiplierBp: number) {
  const axisMaxMultiplier = Math.max(10, axisMaxMultiplierBp / 100);

  return getCrashGraphYAxisTickValues(axisMaxMultiplierBp).map((tick) => ({
    label: tick.label,
    y:
      PLOT.top +
      plotHeight *
        (1 - clamp(tick.multiplier / axisMaxMultiplier, 0, 1)),
  }));
}

export function normalizeCrashGraphPhase(phase: string): CrashGraphPhase {
  if (phase === 'running' || phase === 'crashed') return phase;
  return 'betting';
}

function multiplierProgress(multiplierBp: number) {
  const multiplier = Math.max(0, multiplierBp / 100 - 1);
  const axisMaxMultiplier = Math.max(
    10,
    getCrashGraphAxisMaxMultiplierBp(multiplierBp) / 100,
  );
  return 1 - Math.exp(-multiplier / axisMaxMultiplier);
}

function multiplierAxisLift(multiplierBp: number) {
  const multiplier = Math.max(1, multiplierBp / 100);
  const axisMaxMultiplier = Math.max(
    10,
    getCrashGraphAxisMaxMultiplierBp(multiplierBp) / 100,
  );

  return clamp(multiplier / axisMaxMultiplier, 0, 1);
}

export function resolveCrashGraphProgress(
  graphProgress: number,
  multiplierBp: number,
  phase: string,
) {
  const graphPhase = normalizeCrashGraphPhase(phase);
  const normalizedProgress = Math.max(graphProgress, 0);
  const multiplierLift = multiplierProgress(multiplierBp);

  if (graphPhase === 'betting') {
    return 0;
  }

  const liveProgress = Math.max(normalizedProgress, multiplierLift * 0.9);

  return liveProgress;
}

export function buildCrashCurvePlot(
  progress: number,
  multiplierBp: number,
  phase: CrashGraphPhase,
): CrashCurvePlot {
  const normalizedProgress = Math.max(progress, 0);
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
    : Math.max(
        exponentialEase(normalizedProgress * 0.95),
        multiplierLift * 0.86,
      );
  const curveProgress = isBetting ? visualProgress * 0.72 : visualProgress;
  const axisLift = multiplierAxisLift(multiplierBp);
  const horizontalProgress = isBetting
    ? curveProgress
    : clamp(normalizedProgress / 4.5, 0, 0.999);
  const endpointLift = isBetting
    ? clamp(0.028 + curveProgress * 0.065, 0.032, 0.05)
    : clamp(
        0.02 + axisLift * 0.94,
        0.048,
        phase === 'crashed' ? 0.98 : 0.94,
      );

  const startX = baselineStartX;
  const startY = floorY;
  const endX = startX + plotWidth * horizontalProgress;
  const endY = floorY - plotHeight * endpointLift;
  const curvePath = buildExponentialCurvePath(startX, startY, endX, endY);
  const curvePathPoints = curvePath.match(/(?:M|L)\s+[-0-9.]+\s+[-0-9.]+/g) ?? [];
  const lastPoint = curvePathPoints.at(-1)?.split(/\s+/).slice(1).map(Number) ?? [endX, endY];
  const previousPoint =
    curvePathPoints.at(-2)?.split(/\s+/).slice(1).map(Number) ?? [startX, startY];
  const [prevX, prevY] = previousPoint;
  const [lastX, lastY] = lastPoint;
  const markerAngle =
    (Math.atan2(lastY - prevY, lastX - prevX) * 180) / Math.PI;

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
    controlOneX: startX + (endX - startX) * 0.35,
    controlOneY: startY - (startY - endY) * 0.12,
    controlTwoX: startX + (endX - startX) * 0.78,
    controlTwoY: startY - (startY - endY) * 0.76,
  };
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
  const axisMaxMultiplierBp = getCrashGraphAxisMaxMultiplierBp(multiplierBp);
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
  const yAxisTicks = useMemo(
    () => buildYAxisTicks(axisMaxMultiplierBp),
    [axisMaxMultiplierBp],
  );
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

    if (graphPhase === 'running') {
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
      yAxisTicks,
      curveGradientId,
      areaGradientId,
      markerGradientId,
      impactGradientId,
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
      yAxisTicks,
      visual,
    ],
  );

  return (
    <CrashGraphContext.Provider value={value}>
      {children}
    </CrashGraphContext.Provider>
  );
}

import { formatMultiplier } from "@crash/contracts";

const EXPONENTIAL_SCALE_STRENGTH = 1.35;
const DEFAULT_GRAPH_HEIGHT_PX = 214;
const DEFAULT_GRAPH_DURATION_SECONDS = 8;
const MIN_AXIS_MAX_MULTIPLIER = 10;
const MAX_AXIS_MAX_MULTIPLIER = 20;
const TARGET_TICK_SPACING_PX = 56;
const TARGET_TIME_TICK_SPACING_PX = 92;

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getDesiredYAxisTickCount(graphHeightPx: number) {
  return clamp(Math.round(graphHeightPx / TARGET_TICK_SPACING_PX), 4, 8);
}

function getNiceStep(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;

  return niceFraction * 10 ** exponent;
}

function formatTimeAxisLabel(seconds: number) {
  const normalized = Math.max(seconds, 0);
  const rounded = Math.abs(normalized - Math.round(normalized)) < 1e-9
    ? `${Math.round(normalized)}`
    : normalized
        .toFixed(2)
        .replace(/\.00$/, '')
        .replace(/(\.\d)0$/, '$1');

  return `${rounded}s`;
}

export function getCrashGraphAxisMaxMultiplierBp(
  multiplierBp: number,
  graphHeightPx = DEFAULT_GRAPH_HEIGHT_PX,
) {
  const multiplier = Math.max(1, multiplierBp / 100);
  const desiredTickCount = getDesiredYAxisTickCount(graphHeightPx);
  const rawAxisMax = Math.max(
    MIN_AXIS_MAX_MULTIPLIER,
    multiplier * (1 + 1 / (desiredTickCount + 1)),
  );
  const step = getNiceStep(rawAxisMax / desiredTickCount);
  return Math.min(
    MAX_AXIS_MAX_MULTIPLIER * 100,
    Math.ceil(rawAxisMax / step) * step * 100,
  );
}

export function scaleCrashGraphMultiplier(
  multiplier: number,
  axisMaxMultiplier: number,
) {
  const normalized = clamp(
    (multiplier - 1) / Math.max(axisMaxMultiplier - 1, 1),
    0,
    1,
  );
  const maxScale = Math.expm1(EXPONENTIAL_SCALE_STRENGTH);

  return Math.expm1(normalized * EXPONENTIAL_SCALE_STRENGTH) / maxScale;
}

export function exponentialCurveProgress(value: number, strength = 4.2) {
  const normalized = clamp(value, 0, 1);
  const maxCurve = Math.expm1(strength);

  return Math.expm1(normalized * strength) / maxCurve;
}

export function getCrashGraphYAxisTickValues(
  axisMaxMultiplierBp: number,
  graphHeightPx = DEFAULT_GRAPH_HEIGHT_PX,
) {
  const axisMaxMultiplier = Math.min(
    MAX_AXIS_MAX_MULTIPLIER,
    Math.max(MIN_AXIS_MAX_MULTIPLIER, axisMaxMultiplierBp / 100),
  );
  const desiredTickCount = getDesiredYAxisTickCount(graphHeightPx);
  const step = getNiceStep(axisMaxMultiplier / desiredTickCount);
  const ticks: Array<{ label: string; multiplier: number }> = [];

  for (let value = step; value <= axisMaxMultiplier + 1e-9; value += step) {
    ticks.push({
      label: formatMultiplier(Math.round(value * 100)),
      multiplier: value,
    });
  }

  if (ticks.length === 0) {
    return [
      {
        label: formatMultiplier(Math.round(axisMaxMultiplier * 100)),
        multiplier: axisMaxMultiplier,
      },
    ];
  }

  return ticks;
}

export function getCrashGraphXAxisTickValues(
  durationSeconds = DEFAULT_GRAPH_DURATION_SECONDS,
  graphWidthPx = 618,
) {
  const axisDurationSeconds = Math.max(1, durationSeconds);
  const desiredTickCount = clamp(
    Math.round(graphWidthPx / TARGET_TIME_TICK_SPACING_PX),
    4,
    8,
  );
  const step = getNiceStep(axisDurationSeconds / desiredTickCount);
  const ticks: Array<{ label: string; seconds: number }> = [];

  for (let seconds = 0; seconds <= axisDurationSeconds + 1e-9; seconds += step) {
    ticks.push({
      label: formatTimeAxisLabel(seconds),
      seconds,
    });
  }

  if (ticks.length === 0 || ticks[0]?.seconds !== 0) {
    ticks.unshift({
      label: "0s",
      seconds: 0,
    });
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || lastTick.seconds < axisDurationSeconds - 1e-9) {
    ticks.push({
      label: formatTimeAxisLabel(axisDurationSeconds),
      seconds: axisDurationSeconds,
    });
  }

  return ticks;
}

export function calculateCrashGraphProgress(liveMultiplierBp: number) {
  const multiplier = Math.max(1, liveMultiplierBp / 100);
  const axisMaxMultiplier = Math.max(
    MIN_AXIS_MAX_MULTIPLIER,
    getCrashGraphAxisMaxMultiplierBp(liveMultiplierBp) / 100,
  );

  return Math.expm1(
    scaleCrashGraphMultiplier(multiplier, axisMaxMultiplier) *
      EXPONENTIAL_SCALE_STRENGTH,
  );
}

export function freezeCrashGraphProgress(
  previousProgress: number,
  liveMultiplierBp: number,
) {
  return Math.max(previousProgress, calculateCrashGraphProgress(liveMultiplierBp));
}

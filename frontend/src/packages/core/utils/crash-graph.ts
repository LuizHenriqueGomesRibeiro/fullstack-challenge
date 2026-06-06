const Y_AXIS_NICE_MULTIPLIERS = [1, 2, 5, 10, 20, 50, 100];
const Y_AXIS_MAX_MULTIPLIERS = [10, 20, 50, 100, 200, 500, 1000];
const EXPONENTIAL_SCALE_STRENGTH = 1.35;

export function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function getCrashGraphAxisMaxMultiplierBp(multiplierBp: number) {
  const multiplier = Math.max(1, multiplierBp / 100);

  for (const niceMultiplier of Y_AXIS_MAX_MULTIPLIERS) {
    if (multiplier <= niceMultiplier) {
      return niceMultiplier * 100;
    }
  }

  return Math.ceil(multiplier / 500) * 500 * 100;
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

export function getCrashGraphYAxisTickValues(axisMaxMultiplierBp: number) {
  const axisMaxMultiplier = Math.max(10, axisMaxMultiplierBp / 100);

  return Y_AXIS_NICE_MULTIPLIERS.filter(
    (value) => value <= axisMaxMultiplier,
  ).map((value) => ({
    label: `${value}x`,
    multiplier: value,
  }));
}

export function calculateCrashGraphProgress(liveMultiplierBp: number) {
  const multiplier = Math.max(1, liveMultiplierBp / 100);
  const axisMaxMultiplier = Math.max(
    10,
    getCrashGraphAxisMaxMultiplierBp(liveMultiplierBp) / 100,
  );

  return Math.expm1(
    scaleCrashGraphMultiplier(multiplier, axisMaxMultiplier) *
      EXPONENTIAL_SCALE_STRENGTH,
  );
}

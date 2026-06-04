export const MIN_BET_CENTS = 100;
export const MAX_BET_CENTS = 100_000;

export function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

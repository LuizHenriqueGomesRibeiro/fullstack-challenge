import { createHash, createHmac, randomBytes } from "node:crypto";
import type { MultiplierBasisPoints } from "@crash/contracts";

const MAX_CRASH_POINT_BP = 2_000;

export interface ProvablyFairResult {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  hmac: string;
  crashPointBp: MultiplierBasisPoints;
}

export function createProvablyFairRound(
  clientSeed: string,
  nonce: number,
): ProvablyFairResult {
  const serverSeed = randomBytes(32).toString("hex");
  return verifyProvablyFairRound(serverSeed, clientSeed, nonce);
}

export function verifyProvablyFairRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): ProvablyFairResult {
  const serverSeedHash = sha256(serverSeed);
  const hmac = createHmac("sha256", serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest("hex");

  return {
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    hmac,
    crashPointBp: calculateCrashPointBp(hmac),
  };
}

function calculateCrashPointBp(hmac: string): MultiplierBasisPoints {
  const houseEdgeCheck = BigInt(`0x${hmac.slice(0, 8)}`);

  if (houseEdgeCheck % 33n === 0n) {
    return 100;
  }

  const e = 2n ** 52n;
  const hashAsInt = BigInt(`0x${hmac.slice(0, 13)}`);
  const crashPoint = Number((100n * e - hashAsInt) / (e - hashAsInt));

  return Math.max(100, Math.min(crashPoint, MAX_CRASH_POINT_BP));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

import { describe, expect, it } from "bun:test";
import { payoutForMultiplier } from "@crash/contracts";
import { verifyProvablyFairRound } from "../../src/domain/provably-fair";

describe("provably fair crash calculation", () => {
  it("is deterministic for the same server seed, client seed and nonce", () => {
    const first = verifyProvablyFairRound("server-seed", "client-seed", 7);
    const second = verifyProvablyFairRound("server-seed", "client-seed", 7);

    expect(first).toEqual(second);
    expect(first.crashPointBp).toBeGreaterThanOrEqual(100);
    expect(first.serverSeedHash).toHaveLength(64);
    expect(first.hmac).toHaveLength(64);
  });

  it("calculates payouts in integer cents", () => {
    expect(payoutForMultiplier(1_999, 175)).toBe(3_498);
  });
});

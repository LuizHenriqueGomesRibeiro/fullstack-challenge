import { describe, expect, it } from "bun:test";
import {
  isAccessTokenExpiring,
  playerFromTokens,
  type StoredTokenSet,
} from "./oidc";

describe("OIDC helpers", () => {
  it("derives the player identity from the preferred username claim", () => {
    const tokens: StoredTokenSet = {
      accessToken: createJwt({
        preferred_username: "neo",
        sub: "player-1",
      }),
      expiresAt: Date.now() + 120_000,
      tokenType: "Bearer",
    };

    expect(playerFromTokens(tokens)).toEqual({
      id: "player-1",
      username: "neo",
    });
  });

  it("falls back to the name claim and detects tokens close to expiry", () => {
    const tokens: StoredTokenSet = {
      accessToken: createJwt({
        name: "Trinity",
        sub: "player-2",
      }),
      expiresAt: Date.now() + 30_000,
      tokenType: "Bearer",
    };

    expect(playerFromTokens(tokens)).toEqual({
      id: "player-2",
      username: "Trinity",
    });
    expect(isAccessTokenExpiring(tokens)).toBe(true);
    expect(isAccessTokenExpiring(tokens, 10_000)).toBe(false);
  });
});

function createJwt(claims: Record<string, unknown>): string {
  const header = base64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  return `${header}.${payload}.signature`;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

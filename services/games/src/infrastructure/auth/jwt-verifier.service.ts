import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedPlayerDto } from "@crash/contracts";
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  nbf?: number;
  preferred_username?: string;
  sub?: string;
}

interface Jwk {
  alg?: string;
  e?: string;
  kid?: string;
  kty?: string;
  n?: string;
  use?: string;
}

interface JwksResponse {
  keys?: Jwk[];
}

@Injectable()
export class JwtVerifierService {
  private readonly issuer =
    process.env.OIDC_ISSUER ?? "http://localhost:8080/realms/crash-game";
  private readonly jwksUrl =
    process.env.OIDC_JWKS_URL ??
    `${this.issuer}/protocol/openid-connect/certs`;
  private readonly audience = process.env.OIDC_AUDIENCE;
  private readonly jwksTtlMs = 5 * 60 * 1000;
  private cachedKeys = new Map<string, Jwk>();
  private cachedUntil = 0;

  async verifyToken(token: string): Promise<AuthenticatedPlayerDto> {
    const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");

    if (!encodedHeader || !encodedClaims || !encodedSignature) {
      throw new UnauthorizedException("Malformed bearer token.");
    }

    const header = decodeJwtPart<JwtHeader>(encodedHeader);
    const claims = decodeJwtPart<JwtClaims>(encodedClaims);

    if (header.alg !== "RS256" || !header.kid) {
      throw new UnauthorizedException("Unsupported bearer token.");
    }

    this.validateClaims(claims);

    const key = await this.getKey(header.kid);
    const data = Buffer.from(`${encodedHeader}.${encodedClaims}`);
    const signature = Buffer.from(encodedSignature, "base64url");
    const publicKey = createPublicKey({ key: key as JsonWebKey, format: "jwk" });

    if (!verify("RSA-SHA256", data, publicKey, signature)) {
      throw new UnauthorizedException("Invalid bearer token signature.");
    }

    if (!claims.sub) {
      throw new UnauthorizedException("Bearer token has no subject.");
    }

    return {
      playerId: claims.sub,
      subject: claims.sub,
      username:
        claims.preferred_username ??
        claims.name ??
        claims.email ??
        claims.sub,
    };
  }

  private validateClaims(claims: JwtClaims): void {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (claims.iss !== this.issuer) {
      throw new UnauthorizedException("Bearer token issuer is invalid.");
    }

    if (!claims.exp || claims.exp <= nowSeconds) {
      throw new UnauthorizedException("Bearer token is expired.");
    }

    if (claims.nbf && claims.nbf > nowSeconds) {
      throw new UnauthorizedException("Bearer token is not active yet.");
    }

    if (this.audience && !matchesAudience(claims.aud, this.audience)) {
      throw new UnauthorizedException("Bearer token audience is invalid.");
    }
  }

  private async getKey(kid: string): Promise<Jwk> {
    if (Date.now() >= this.cachedUntil || !this.cachedKeys.has(kid)) {
      await this.refreshKeys();
    }

    const key = this.cachedKeys.get(kid);

    if (!key) {
      throw new UnauthorizedException("Bearer token key is unknown.");
    }

    return key;
  }

  private async refreshKeys(): Promise<void> {
    const response = await fetch(this.jwksUrl);

    if (!response.ok) {
      throw new UnauthorizedException("Unable to load identity provider keys.");
    }

    const jwks = (await response.json()) as JwksResponse;
    const keys = new Map<string, Jwk>();

    for (const key of jwks.keys ?? []) {
      if (key.kid && key.kty === "RSA") {
        keys.set(key.kid, key);
      }
    }

    this.cachedKeys = keys;
    this.cachedUntil = Date.now() + this.jwksTtlMs;
  }
}

function decodeJwtPart<T>(encoded: string): T {
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    throw new UnauthorizedException("Bearer token is not valid JSON.");
  }
}

function matchesAudience(
  tokenAudience: string | string[] | undefined,
  expectedAudience: string,
): boolean {
  if (Array.isArray(tokenAudience)) {
    return tokenAudience.includes(expectedAudience);
  }

  return tokenAudience === expectedAudience;
}

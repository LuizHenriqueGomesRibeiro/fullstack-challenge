import {
  DEFAULT_PLAYER_ID,
  DEFAULT_USERNAME,
  PLAYER_ID_HEADER,
  PLAYER_NAME_HEADER,
} from '@crash/contracts'

const env = import.meta.env

export const AUTH_CHANGED_EVENT = 'crash-auth-changed'

const FLOW_STORAGE_KEY = 'crash.oidc.flow'
const TOKEN_STORAGE_KEY = 'crash.oidc.tokens'
const DEFAULT_SCOPE = 'openid profile email'

export interface PlayerIdentity {
  id: string
  username: string
}

export interface StoredTokenSet {
  accessToken: string
  expiresAt: number
  idToken?: string
  refreshExpiresAt?: number
  refreshToken?: string
  tokenType: string
}

interface OidcFlowState {
  codeVerifier: string
  returnTo: string
  state: string
}

interface TokenEndpointResponse {
  access_token?: string
  expires_in?: number
  id_token?: string
  refresh_expires_in?: number
  refresh_token?: string
  token_type?: string
}

interface JwtClaims {
  email?: string
  exp?: number
  name?: string
  preferred_username?: string
  sub?: string
}

export function getOidcConfig() {
  return {
    clientId: env.VITE_OIDC_CLIENT_ID ?? 'crash-game-client',
    issuer:
      env.VITE_OIDC_ISSUER ??
      'http://localhost:8080/realms/crash-game',
    scope: env.VITE_OIDC_SCOPE ?? DEFAULT_SCOPE,
  }
}

export async function startOidcLogin(returnTo = getCurrentRoute()) {
  const { clientId, issuer, scope } = getOidcConfig()
  const codeVerifier = base64UrlFromBytes(crypto.getRandomValues(new Uint8Array(32)))
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const state = base64UrlFromBytes(crypto.getRandomValues(new Uint8Array(32)))
  const flow: OidcFlowState = {
    codeVerifier,
    returnTo: normalizeReturnTo(returnTo),
    state,
  }

  sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(flow))

  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope,
    state,
  })

  window.location.assign(`${issuer}/protocol/openid-connect/auth?${params}`)
}

export async function completeOidcCallback(callbackUrl = window.location.href) {
  const url = new URL(callbackUrl)
  const error = url.searchParams.get('error')

  if (error) {
    const description = url.searchParams.get('error_description')
    throw new Error(description ? `${error}: ${description}` : error)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const flow = readFlowState()

  if (!code || !state) {
    throw new Error('Callback OIDC sem code/state.')
  }

  if (!flow || flow.state !== state) {
    throw new Error('State OIDC invalido. Inicie o login novamente.')
  }

  const tokens = await exchangeAuthorizationCode(code, flow.codeVerifier)
  storeTokenSet(tokens)
  sessionStorage.removeItem(FLOW_STORAGE_KEY)
  notifyAuthChanged()

  return flow.returnTo
}

export async function refreshStoredTokens() {
  const tokens = getStoredTokenSet()

  if (!tokens?.refreshToken) {
    throw new Error('Refresh token indisponivel.')
  }

  if (tokens.refreshExpiresAt && tokens.refreshExpiresAt <= Date.now()) {
    clearStoredTokens()
    throw new Error('Refresh token expirado.')
  }

  const { clientId, issuer } = getOidcConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
  })

  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })

  if (!response.ok) {
    clearStoredTokens()
    throw new Error(await readTokenEndpointError(response))
  }

  const refreshed = mapTokenResponse(await response.json())
  storeTokenSet(refreshed)
  notifyAuthChanged()

  return refreshed
}

export function logoutFromOidc() {
  const tokens = getStoredTokenSet()
  const { clientId, issuer } = getOidcConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    post_logout_redirect_uri: window.location.origin,
  })

  if (tokens?.idToken) {
    params.set('id_token_hint', tokens.idToken)
  }

  clearStoredTokens()
  notifyAuthChanged()
  window.location.assign(`${issuer}/protocol/openid-connect/logout?${params}`)
}

export function getStoredTokenSet(): StoredTokenSet | null {
  const rawValue = localStorage.getItem(TOKEN_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as StoredTokenSet
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    return null
  }
}

export function clearStoredTokens() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export function getAuthenticatedPlayer(): PlayerIdentity | null {
  const tokens = getStoredTokenSet()

  if (!tokens) {
    return null
  }

  return playerFromTokens(tokens)
}

export function getFallbackPlayer(): PlayerIdentity {
  return {
    id: env.VITE_PLAYER_ID ?? DEFAULT_PLAYER_ID,
    username: env.VITE_PLAYER_NAME ?? DEFAULT_USERNAME,
  }
}

export function playerHeaders(player = getAuthenticatedPlayer() ?? getFallbackPlayer()) {
  const tokenSet = getStoredTokenSet()
  const headers: Record<string, string> = {
    [PLAYER_ID_HEADER]: player.id,
    [PLAYER_NAME_HEADER]: player.username,
  }

  if (tokenSet?.accessToken) {
    headers.Authorization = `${tokenSet.tokenType} ${tokenSet.accessToken}`
  }

  return headers
}

export function isAccessTokenExpiring(tokens: StoredTokenSet, withinMs = 60_000) {
  return tokens.expiresAt - Date.now() <= withinMs
}

export function playerFromTokens(tokens: StoredTokenSet): PlayerIdentity | null {
  const claims = parseJwtClaims(tokens.idToken ?? tokens.accessToken)

  if (!claims?.sub) {
    return null
  }

  return {
    id: claims.sub,
    username:
      claims.preferred_username ??
      claims.name ??
      claims.email ??
      claims.sub,
  }
}

function storeTokenSet(tokens: StoredTokenSet) {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens))
}

async function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  const { clientId, issuer } = getOidcConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
  })

  const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await readTokenEndpointError(response))
  }

  return mapTokenResponse(await response.json())
}

function mapTokenResponse(response: TokenEndpointResponse): StoredTokenSet {
  if (!response.access_token) {
    throw new Error('Resposta OIDC sem access_token.')
  }

  const issuedAt = Date.now()
  const expiresIn = response.expires_in ?? 300
  const refreshExpiresIn = response.refresh_expires_in

  return {
    accessToken: response.access_token,
    expiresAt: issuedAt + expiresIn * 1000,
    idToken: response.id_token,
    refreshExpiresAt: refreshExpiresIn
      ? issuedAt + refreshExpiresIn * 1000
      : undefined,
    refreshToken: response.refresh_token,
    tokenType: response.token_type ?? 'Bearer',
  }
}

async function readTokenEndpointError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: string
      error_description?: string
    }

    if (body.error_description) {
      return body.error_description
    }

    if (body.error) {
      return body.error
    }
  } catch {
    return `Falha no token endpoint (${response.status}).`
  }

  return `Falha no token endpoint (${response.status}).`
}

function readFlowState(): OidcFlowState | null {
  const rawValue = sessionStorage.getItem(FLOW_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as OidcFlowState
  } catch {
    sessionStorage.removeItem(FLOW_STORAGE_KEY)
    return null
  }
}

function parseJwtClaims(token: string): JwtClaims | null {
  const [, payload] = token.split('.')

  if (!payload) {
    return null
  }

  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims
  } catch {
    return null
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )

  return base64UrlFromBytes(new Uint8Array(digest))
}

function base64UrlFromBytes(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getRedirectUri() {
  return `${window.location.origin}/auth/callback`
}

function getCurrentRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function normalizeReturnTo(returnTo: string) {
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/'
  }

  if (returnTo.startsWith('/auth/callback') || returnTo.startsWith('/login')) {
    return '/'
  }

  return returnTo
}

function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

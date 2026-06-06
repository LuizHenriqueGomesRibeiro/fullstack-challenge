import { create } from 'zustand'
import {
  AUTH_CHANGED_EVENT,
  clearStoredTokens,
  completeOidcCallback,
  getStoredTokenSet,
  isAccessTokenExpiring,
  logoutFromOidc,
  playerFromTokens,
  refreshStoredTokens,
  startOidcLogin,
  type PlayerIdentity,
  type StoredTokenSet,
} from '../hooks/auth/oidc'

type AuthStatus = 'anonymous' | 'authenticated'

export interface AuthSnapshot {
  player: PlayerIdentity | null
  status: AuthStatus
  tokens: StoredTokenSet | null
}

export interface AuthState extends AuthSnapshot {
  completeLogin: () => Promise<string>
  login: (returnTo?: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<StoredTokenSet>,
  initializeAuthStore: () => void
}

const REFRESH_AHEAD_MS = 60_000

let initialized = false
let refreshTimer: number | undefined

function isBrowser() {
  return typeof window !== 'undefined'
}

function readAuthSnapshot(): AuthSnapshot {
  if (!isBrowser()) {
    return {
      player: null,
      status: 'anonymous',
      tokens: null,
    }
  }

  const tokens = getStoredTokenSet()
  const player = tokens ? playerFromTokens(tokens) : null

  return {
    player,
    status: tokens && player ? 'authenticated' : 'anonymous',
    tokens,
  }
}

function syncAuthState() {
  useAuth.setState(readAuthSnapshot());
}

function clearRefreshTimer() {
  if (!isBrowser() || refreshTimer === undefined) {
    return;
  }

  window.clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function scheduleRefresh(tokens: StoredTokenSet | null) {
  clearRefreshTimer()

  if (!isBrowser() || !tokens) {
    return
  }

  if (isAccessTokenExpiring(tokens, REFRESH_AHEAD_MS)) {
    void refreshStoredTokens()
      .catch(() => clearStoredTokens())
      .finally(syncAuthState);

    return;
  }

  const refreshDelay = Math.max(tokens.expiresAt - Date.now() - REFRESH_AHEAD_MS, 0);

  refreshTimer = window.setTimeout(() => {
    void refreshStoredTokens()
      .catch(() => clearStoredTokens())
      .finally(syncAuthState);
  }, refreshDelay)
}

export const useAuth = create<AuthState>()((_set, _get) => ({
  ...readAuthSnapshot(),
  completeLogin: async () => {
    const returnTo = await completeOidcCallback();
    syncAuthState();

    return returnTo;
  },
  login: startOidcLogin,
  logout: () => {
    logoutFromOidc();
    syncAuthState();
  },
  refresh: async () => {
    const refreshed = await refreshStoredTokens()
    syncAuthState();

    return refreshed;
  },
  initializeAuthStore: () => {
    if (!isBrowser() || initialized) {
      return;
    }
    
    initialized = true;
    
    const syncAndSchedule = () => {
      const snapshot = readAuthSnapshot();
      useAuth.setState(snapshot);
      
      scheduleRefresh(snapshot.tokens);
    }
    
    window.addEventListener(AUTH_CHANGED_EVENT, syncAndSchedule);
    window.addEventListener('storage', syncAndSchedule);
    
    syncAndSchedule();
  }
}));
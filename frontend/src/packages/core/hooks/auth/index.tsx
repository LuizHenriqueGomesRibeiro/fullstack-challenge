import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
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
} from './oidc'

type AuthStatus = 'anonymous' | 'authenticated'

interface AuthSnapshot {
  player: PlayerIdentity | null
  status: AuthStatus
  tokens: StoredTokenSet | null
}

interface AuthContextValue extends AuthSnapshot {
  completeLogin: () => Promise<string>
  login: (returnTo?: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<StoredTokenSet>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState(readAuthSnapshot)

  useEffect(() => {
    const syncAuth = () => setSnapshot(readAuthSnapshot())

    window.addEventListener(AUTH_CHANGED_EVENT, syncAuth)
    window.addEventListener('storage', syncAuth)

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncAuth)
      window.removeEventListener('storage', syncAuth)
    }
  }, [])

  useEffect(() => {
    const tokens = snapshot.tokens

    if (!tokens) {
      return
    }

    if (isAccessTokenExpiring(tokens)) {
      void refreshStoredTokens()
        .catch(() => clearStoredTokens())
        .finally(() => setSnapshot(readAuthSnapshot()))
      return
    }

    const refreshDelay = tokens.expiresAt - Date.now() - 60_000
    const refreshTimer = window.setTimeout(() => {
      void refreshStoredTokens()
        .catch(() => clearStoredTokens())
        .finally(() => setSnapshot(readAuthSnapshot()))
    }, refreshDelay);

    return () => window.clearTimeout(refreshTimer)
  }, [snapshot.tokens])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      completeLogin: completeOidcCallback,
      login: startOidcLogin,
      logout: logoutFromOidc,
      refresh: refreshStoredTokens,
    }),
    [snapshot],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }

  return context
}

function readAuthSnapshot(): AuthSnapshot {
  const tokens = getStoredTokenSet()
  const player = tokens ? playerFromTokens(tokens) : null

  return {
    player,
    status: tokens && player ? 'authenticated' : 'anonymous',
    tokens,
  }
}

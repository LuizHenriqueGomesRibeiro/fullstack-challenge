import type { PropsWithChildren } from 'react'

export {
  useAuth,
  type AuthSnapshot,
  type AuthState,
} from '../../stores/auth'

export function AuthProvider({ children }: PropsWithChildren) {
  return children
}

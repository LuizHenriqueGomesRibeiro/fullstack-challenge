import { createFileRoute } from '@tanstack/react-router'
import AuthCallbackPage from '../../../../pages/auth-callback'

export const Route = createFileRoute('/(app)/auth/callback/')({
  component: AuthCallbackPage,
})

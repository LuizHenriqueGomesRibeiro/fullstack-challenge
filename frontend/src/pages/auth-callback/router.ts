import { createFileRoute } from '@tanstack/react-router'
import AuthCallbackPage from './index'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

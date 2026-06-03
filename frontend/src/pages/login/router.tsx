import { createFileRoute } from '@tanstack/react-router'
import LoginPage from './index'

interface LoginSearch {
  returnTo: string
}

export const Route = createFileRoute('/login')({
  component: LoginRouteComponent,
  validateSearch: (search): LoginSearch => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/',
  }),
})

function LoginRouteComponent() {
  const search = Route.useSearch()

  return <LoginPage returnTo={search.returnTo} />
}

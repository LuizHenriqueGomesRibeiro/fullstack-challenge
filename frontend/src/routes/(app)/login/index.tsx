import { createFileRoute } from '@tanstack/react-router'
import LoginPage from '../../../pages/login'

interface LoginSearch {
  returnTo: string
}

export const Route = createFileRoute('/(app)/login/')({
  component: LoginRouteComponent,
  validateSearch: (search): LoginSearch => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : '/',
  }),
})

function LoginRouteComponent() {
  const search = Route.useSearch()

  return <LoginPage returnTo={search.returnTo} />
}

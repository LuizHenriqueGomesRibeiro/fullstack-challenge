import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useAuth } from '../packages/core/hooks/auth'
import type { RouterContext } from '../packages/core/integrations/tanstack-query/root-provider'

export function RootLayout() {
  const auth = useAuth()

  return (
    <div className="shell">
      <main className="card">
        <div className="topline">
          <div className="brand">Jungle Crash</div>
          <nav className="nav">
            <Link to="/" activeProps={{ className: 'active' }}>
              Jogo
            </Link>
            <Link to="/about" activeProps={{ className: 'active' }}>
              Arquitetura
            </Link>
            {auth.status === 'authenticated' && auth.player ? (
              <button className="nav-session" onClick={auth.logout} type="button">
                Sair de {auth.player.username}
              </button>
            ) : (
              <Link
                activeProps={{ className: 'active' }}
                search={{ returnTo: '/' }}
                to="/login"
              >
                Entrar
              </Link>
            )}
          </nav>
        </div>
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  )
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Jungle Crash',
      },
    ],
  }),
  component: RootLayout,
})

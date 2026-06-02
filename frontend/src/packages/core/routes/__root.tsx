import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export function RootLayout() {
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
          </nav>
        </div>
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  )
}

export const Route = createRootRoute({
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

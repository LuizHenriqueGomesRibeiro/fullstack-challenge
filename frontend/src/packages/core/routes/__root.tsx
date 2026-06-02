import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export function RootLayout() {
  return (
    <div className="shell">
      <main className="card">
        <div className="topline">
          <div className="brand">TanStack Start</div>
          <nav className="nav">
            <Link to="/" activeProps={{ className: 'active' }}>
              Home
            </Link>
            <Link to="/about" activeProps={{ className: 'active' }}>
              About
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
        title: 'TanStack Start',
      },
    ],
  }),
  component: RootLayout,
})

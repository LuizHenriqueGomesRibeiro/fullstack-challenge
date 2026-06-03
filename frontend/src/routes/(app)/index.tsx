import { Link, createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '../../packages/core/hooks/auth'
import { useSocketInstance } from '../../packages/core/stores'
import HomePage from '../../pages/home'

export const Route = createFileRoute('/(app)/')({
  component: HomeRoute,
})

function HomeRoute() {
  const auth = useAuth()
  const queryClient = useQueryClient()
  const socket = useSocketInstance()
  const player = auth.player

  useEffect(() => {
    if (auth.status !== 'authenticated' || !player) {
      return
    }

    if (socket.isConnected || socket.socket) {
      return
    }

    socket.connect(player, queryClient)
  }, [auth.status, player, queryClient, socket])

  if (auth.status !== 'authenticated' || !player) {
    return (
      <section className="auth-panel">
        <div className="eyebrow">Login OIDC / Keycloak</div>
        <h1>Entre para jogar multiplayer.</h1>
        <p className="lede">
          Cada sessao usa o usuario autenticado no Keycloak para criar carteira,
          apostar e fazer cashout com identidade propria.
        </p>
        <Link className="primary-action auth-action" search={{ returnTo: '/' }} to="/login">
          Entrar com Keycloak
        </Link>
      </section>
    )
  }

  return <HomePage player={player} />
}

import { Link, createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '../../packages/core/hooks/auth'
import { useSocketInstance } from '../../packages/core/stores'
import HomePage from '../../pages/home'
import { AuthGate } from 'src/packages/ui'

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
    return <AuthGate/>
  }

  return <HomePage player={player} />
}
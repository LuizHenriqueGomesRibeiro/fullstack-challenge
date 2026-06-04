import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../packages/core/hooks/auth';
import { AuthGate } from 'src/packages/ui';
import HomePage from '../../pages/home';
import useSocketInstance from '../../packages/core/stores/socket';

export const Route = createFileRoute('/(app)/')({
  component: HomeRoute,
})

function HomeRoute() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const connectSocket = useSocketInstance((state) => state.connect);
  const disconnectSocket = useSocketInstance((state) => state.disconnect);
  const player = auth.player;

  useEffect(() => {
    if (auth.status !== 'authenticated' || !player) {
      disconnectSocket();
      return;
    }

    connectSocket(player, queryClient);

    return () => {
      disconnectSocket();
    };
  }, [auth.status, connectSocket, disconnectSocket, player, queryClient]);

  if (auth.status !== 'authenticated' || !player) {
    return <AuthGate/>
  }

  return <HomePage player={player} />
}

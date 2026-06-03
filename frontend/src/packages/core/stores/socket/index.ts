import { realtimeEventSchema, realtimeSocketPath, realtimeSocketUrl } from "../../zodios/api";
import { QueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { create } from "zustand";
import { useUtil } from "../../hooks";
import { PlayerIdentity } from "../../hooks/auth/oidc";
import { RealtimeEventType } from "@crash/contracts";
import { useRoundQueryOptions } from "../../hooks/roundQuery";

const realtimeTypes: RealtimeEventType[] = [
  'round.created',
  'round.started',
  'round.tick',
  'bet.placed',
  'bet.cashout',
  'round.crashed',
  'wallet.updated',
];

interface SocketInstanceProps {
  socket: WebSocket | null,
  isConnected: boolean,
  connect: (player: PlayerIdentity, queryClient: QueryClient) => void,
  disconnect: () => void
}

const useSocketInstance = create<SocketInstanceProps>((set, get) => ({
  socket: null,
  isConnected: false,
  connect: (player, queryClient) => {
    const {
      invalidateGameQueries,
      isTickPayload,
    } = useUtil();

    const { isConnected, socket: currentSocket } = get();

    const socket = io(realtimeSocketUrl, {
      path: realtimeSocketPath,
      transports: ['websocket'],
      withCredentials: true,
    });

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    const handleEvent = (rawEvent: unknown) => {
      const parsed = realtimeEventSchema.safeParse(rawEvent);

      if (!parsed.success) {
        return;
      }

      const event = parsed.data;

      if (event.type === 'round.tick' && isTickPayload(event.payload)) {
        queryClient.setQueryData(
          useRoundQueryOptions().queryKey, (data) => {
            const currentMultiplierBp = event.payload.currentMultiplierBp;
            return {
              currentMultiplierBp,
              ...data
            }
          }
        );
        
        return;
      }

      void invalidateGameQueries(queryClient, player.id)
    }

    for (const type of realtimeTypes) {
      socket.on(type, handleEvent)
    }

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });
  },
  disconnect: () => {
    set({ socket: null, isConnected: false });
  }
}));

export default useSocketInstance; 
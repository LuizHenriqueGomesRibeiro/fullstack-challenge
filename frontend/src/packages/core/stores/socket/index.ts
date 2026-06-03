import { realtimeEventSchema, realtimeSocketPath, realtimeSocketUrl } from "../../zodios/api";
import { useRoundQueryOptions } from "../../hooks/roundQuery";
import { PlayerIdentity } from "../../hooks/auth/oidc";
import { RealtimeEventType } from "@crash/contracts";
import { QueryClient } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useUtil } from "../../hooks";
import { create } from "zustand";

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
  socket: Socket | null,
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

    const socket = io(realtimeSocketUrl, {
      path: realtimeSocketPath,
      transports: ['websocket'],
      withCredentials: true,
    });

    set({ socket, isConnected: false });

    socket.on('connect', () => {
      set({ isConnected: true, socket });
    });

    const handleEvent = (rawEvent: unknown) => {
      const parsed = realtimeEventSchema.safeParse(rawEvent);

      if (!parsed.success) {
        return;
      }

      const event = parsed.data;
      const payload = event.payload;

      if (event.type === 'round.tick' && isTickPayload(payload)) {
        queryClient.setQueryData(
          useRoundQueryOptions().queryKey, (data) => {
            if (!data) return data;

            return {
              ...data,
              currentMultiplierBp: payload.currentMultiplierBp,
            } as typeof data;
          }
        );
        
        return;
      }

      void invalidateGameQueries(queryClient, player.id);
    }

    for (const type of realtimeTypes) {
      socket.on(type, handleEvent);
    }

    socket.on('disconnect', () => {
      set({ isConnected: false });
    });
  },
  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, isConnected: false });
  }
}));

export default useSocketInstance; 

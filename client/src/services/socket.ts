import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rightnow/shared';

const url = import.meta.env.VITE_SOCKET_URL || '/';

export type RightnowSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RightnowSocket | null = null;

/** Lazily create (and reuse) the singleton Socket.io connection. */
export function getSocket(): RightnowSocket {
  socket ??= io(url, {
    autoConnect: false,
    transports: ['websocket'],
    auth: () => ({ token: localStorage.getItem('rightnow.accessToken') }),
  });
  return socket;
}

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, Vibe } from '@rightnow/shared';
import { useAuthStore } from '@/store/useAuthStore';
import { useMapStore } from '@/store/useMapStore';
import { useMatchStore } from '@/store/useMatchStore';
import { useChatStore } from '@/store/useChatStore';

const URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export type RightnowSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: RightnowSocket | null = null;
let listenersBound = false;

export function getSocket(): RightnowSocket {
  if (socket) return socket;
  socket = io(URL, {
    autoConnect: false,
    transports: ['websocket'],
    // Auth re-read on every (re)connect so refreshed tokens are picked up.
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken ?? '' }),
    // Exponential backoff between reconnection attempts.
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.5,
  });
  bindListeners(socket);
  return socket;
}

/** Wire server → store updates exactly once. */
function bindListeners(s: RightnowSocket): void {
  if (listenersBound) return;
  listenersBound = true;

  s.on('map:pin:added', (pin) => useMapStore.getState().addPin(pin));
  s.on('map:pin:removed', ({ sessionId }) => useMapStore.getState().removePin(sessionId));
  s.on('map:pin:updated', ({ sessionId, isBoosted }) =>
    useMapStore.getState().updatePin(sessionId, { boosted: isBoosted }),
  );
  s.on('spark:received', (spark) => useMatchStore.getState().addSpark(spark));
  s.on('spark:expired', ({ sparkId }) => useMatchStore.getState().removeSpark(sparkId));
  s.on('match:created', (match) => useMatchStore.getState().setActiveMatch(match));
  s.on('message:received', (msg) => useChatStore.getState().addMessage(msg.matchId, msg));
}

export function connectSocket(): RightnowSocket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

// --- Client → server emitters ----------------------------------------------
export function goLive(payload: {
  vibe: Vibe;
  windowMinutes: number;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}): void {
  getSocket().emit('go:live', payload);
}
export function goOffline(): void {
  getSocket().emit('go:offline');
}
export function sparkSend(targetSessionId: string): void {
  getSocket().emit('spark:send', { targetSessionId });
}
export function sparkAccept(sparkId: string): void {
  getSocket().emit('spark:accept', { sparkId });
}
export function sparkDecline(sparkId: string): void {
  getSocket().emit('spark:decline', { sparkId });
}
export function sendMessage(matchId: string, content: string): void {
  getSocket().emit('message:send', { matchId, content });
}
export function confirmCheckin(matchId: string): void {
  getSocket().emit('checkin:confirm', { matchId });
}
export function emitTyping(matchId: string): void {
  getSocket().emit('typing:start', { matchId });
}

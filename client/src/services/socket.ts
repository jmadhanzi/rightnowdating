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

  // Group double-date match → navigate to /group/:matchId
  s.on('group:match', (payload: { matchId: string; type: string; members: unknown[] }) => {
    // Store group match data for GroupChatScreen to pick up
    sessionStorage.setItem(`group:${payload.matchId}`, JSON.stringify(payload));
    // Navigate to group chat (use window.location to avoid importing useNavigate in a non-component)
    const current = window.location.pathname;
    if (!current.startsWith('/group/')) {
      window.location.href = `/group/${payload.matchId}`;
    }
  });

  // On every (re)connect: clear stale map pins from before the disconnect,
  // because we'll receive a fresh snapshot when the server processes go:live.
  // Also recover any active match the user may have missed while offline.
  s.on('connect', () => {
    useMapStore.getState().clearPins();
    recoverActiveMatch();
  });
}

/**
 * Poll the /chats REST endpoint to find any active match that was created
 * while the socket was disconnected, so the user isn't left stranded on the
 * map screen when they were supposed to be navigating to a venue.
 */
async function recoverActiveMatch(): Promise<void> {
  // Avoid importing api.ts at module level (circular dep risk). Use fetch directly.
  const token = useAuthStore.getState().accessToken;
  if (!token) return;
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseURL}/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      conversations: { matchId: string; isActive: boolean; meetupTime: string | null }[];
    };
    const active = data.conversations.find((c) => c.isActive);
    if (active && !useMatchStore.getState().activeMatch) {
      useMatchStore.getState().setActiveMatch({
        matchId: active.matchId,
        venue: null,
        meetupTime: active.meetupTime ?? new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        countdown: active.meetupTime
          ? Math.max(0, Math.round((Date.parse(active.meetupTime) - Date.now()) / 1000))
          : 1200,
      });
    }
  } catch {
    // Non-fatal — user can still navigate manually.
  }
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

// ── Group chat (Duo Mode) ─────────────────────────────────────────────────
export function joinGroupChat(matchId: string): void {
  getSocket().emit('group:join', { matchId });
}
export function sendGroupMessage(matchId: string, content: string): void {
  getSocket().emit('group:message:send', { matchId, content });
}
export function emitGroupTypingStart(matchId: string): void {
  getSocket().emit('group:typing:start', { matchId });
}
export function emitGroupTypingStop(matchId: string): void {
  getSocket().emit('group:typing:stop', { matchId });
}

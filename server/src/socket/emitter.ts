import type { ServerToClientEvents } from '@rightnow/shared';
import type { RNServer } from './types.js';

/**
 * Holds the live Socket.io server so non-socket modules (services, queues) can
 * push events to a user without importing the socket bootstrap (avoids cycles).
 * When the server isn't running (e.g. unit tests), emits are no-ops.
 */
let io: RNServer | null = null;

export function setIO(server: RNServer): void {
  io = server;
}

export function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  io?.to(`user:${userId}`).emit(event, ...args);
}

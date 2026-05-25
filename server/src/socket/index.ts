import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@rightnow/shared';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

export type RightnowSocketServer = SocketServer<ClientToServerEvents, ServerToClientEvents>;

interface SocketData {
  userId?: string;
}

/**
 * Attaches a Socket.io server to the existing HTTP server. Real-time presence,
 * sparks, and chat are wired up here as the feature set grows.
 */
export function createSocketServer(httpServer: HttpServer): RightnowSocketServer {
  const io: RightnowSocketServer = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.debug({ id: socket.id }, 'socket connected');

    socket.on('presence:subscribe', (bounds) => {
      // TODO: join a geohash room and stream nearby live pins.
      logger.debug({ bounds }, 'presence:subscribe');
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ id: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}

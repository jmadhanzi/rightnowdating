import '@fastify/jwt';
import type { JwtPayload } from '@rightnow/shared';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

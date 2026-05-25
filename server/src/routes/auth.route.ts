import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requestOtp, verifyOtp, refreshAccessToken, logout } from '../services/auth.service.js';

const requestOtpBody = z.object({ phone: z.string().min(1) });
const verifyOtpBody = z.object({ phone: z.string().min(1), otp: z.string().min(1) });
const refreshBody = z.object({ refreshToken: z.string().min(1) });
const logoutBody = z.object({ refreshToken: z.string().min(1) });

/**
 * Phone-OTP authentication routes. Mounted unprefixed so paths are
 * /auth/request-otp, /auth/verify-otp, /auth/refresh, /auth/logout.
 * Rate limiting is applied globally (Redis-backed); request-otp adds a
 * stricter per-phone limit inside the service.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/request-otp', async (request, reply) => {
    const { phone } = requestOtpBody.parse(request.body);
    return reply.send(await requestOtp(phone));
  });

  app.post('/auth/verify-otp', async (request, reply) => {
    const { phone, otp } = verifyOtpBody.parse(request.body);
    return reply.send(await verifyOtp(phone, otp));
  });

  app.post('/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshBody.parse(request.body);
    return reply.send(await refreshAccessToken(refreshToken));
  });

  app.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = logoutBody.parse(request.body);
    return reply.send(await logout(refreshToken));
  });
}

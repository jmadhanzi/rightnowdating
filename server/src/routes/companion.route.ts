import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth.js';
import {
  getCompanionState,
  chat,
  getMessageHistory,
  getMemoryBook,
  generateProactiveMessage,
  runFastForwardOnboarding,
} from '../services/companion.service.js';

const onboardBody = z.object({
  companionName: z.string().min(1).max(50),
  companionType: z.enum(['friend', 'mentor', 'support']),
  userName: z.string().min(1).max(100),
  interests: z.array(z.string().min(1).max(100)).min(1).max(10),
  goals: z.array(z.string().min(1).max(200)).min(1).max(10),
  feelingsAbout: z.string().min(1).max(500),
});

const messageBody = z.object({
  message: z.string().min(1).max(2000),
});

const messagesQuery = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(200, parseInt(v, 10)) : 50)),
  before: z.string().optional(),
});

export async function companionRoutes(app: FastifyInstance): Promise<void> {
  // GET /companion/profile
  app.get('/companion/profile', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const state = await getCompanionState(userId);
    return reply.send(state);
  });

  // POST /companion/onboard
  app.post('/companion/onboard', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const body = onboardBody.parse(request.body);
    await runFastForwardOnboarding(userId, body);
    const state = await getCompanionState(userId);
    return reply.code(201).send({ ok: true, state });
  });

  // POST /companion/message
  app.post('/companion/message', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const { message } = messageBody.parse(request.body);

    // We need the companion name for the response
    const [result, state] = await Promise.all([
      chat(userId, message),
      getCompanionState(userId),
    ]);

    return reply.send({
      reply: result.reply,
      stageAdvanced: result.stageAdvanced,
      milestone: result.milestone ?? null,
      companionName: state.profile.companionName,
    });
  });

  // GET /companion/messages
  app.get('/companion/messages', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const { limit, before } = messagesQuery.parse(request.query);
    const messages = await getMessageHistory(userId, limit, before);
    return reply.send({ messages });
  });

  // GET /companion/memory-book
  app.get('/companion/memory-book', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const memories = await getMemoryBook(userId);
    return reply.send({ memories });
  });

  // GET /companion/proactive
  app.get('/companion/proactive', { preHandler: authenticateToken }, async (request, reply) => {
    const { userId } = request.user;
    const message = await generateProactiveMessage(userId);
    return reply.send({ message });
  });
}

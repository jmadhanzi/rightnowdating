import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, PlanError } from '../utils/errors.js';
import { isProd } from '../utils/env.js';

interface ErrorBody {
  error: { code: string; message: string };
  requiredPlan?: string;
  issues?: unknown;
}

/**
 * Centralised error handler. Maps AppError/Zod/unknown errors to a consistent
 * `{ error: { code, message } }` envelope and logs with context. Stack traces
 * are never returned to clients.
 */
export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const userId = (request.user as { userId?: string } | undefined)?.userId;
  const route = `${request.method} ${request.url}`;

  if (error instanceof ZodError) {
    request.log.warn({ userId, route }, 'validation error');
    reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      issues: error.flatten(),
    } satisfies ErrorBody);
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      request.log.error({ err: error, userId, route }, error.message);
    } else {
      request.log.warn({ userId, route, code: error.code }, error.message);
    }
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    if (error instanceof PlanError) body.requiredPlan = error.requiredPlan;
    reply.status(error.statusCode).send(body);
    return;
  }

  const statusCode = (error as FastifyError).statusCode ?? 500;
  if (statusCode < 500) {
    request.log.warn({ userId, route }, error.message);
    reply.status(statusCode).send({
      error: { code: (error as FastifyError).code ?? 'ERROR', message: error.message },
    } satisfies ErrorBody);
    return;
  }

  request.log.error({ err: error, userId, route }, 'unhandled server error');
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Something went wrong' : error.message,
    },
  } satisfies ErrorBody);
}

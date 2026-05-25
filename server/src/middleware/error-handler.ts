import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isProd } from '../utils/env.js';

/**
 * Centralised error handler. Translates Zod validation errors and Fastify
 * errors into a consistent JSON envelope.
 */
export function errorHandler(
  error: FastifyError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: 'ValidationError',
      message: 'Request validation failed',
      statusCode: 400,
      issues: error.flatten(),
    });
    return;
  }

  const statusCode = (error as FastifyError).statusCode ?? 500;

  if (statusCode >= 500) {
    request.log.error({ err: error }, 'Unhandled server error');
  }

  reply.status(statusCode).send({
    error: error.name ?? 'InternalServerError',
    message: statusCode >= 500 && isProd ? 'Internal server error' : error.message,
    statusCode,
  });
}

import { pino, type LoggerOptions } from 'pino';
import { env, isProd } from './env.js';

export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
};

/** Standalone logger for code outside the Fastify request lifecycle. */
export const logger = pino(loggerOptions);

export type Logger = typeof logger;

/**
 * Runs before any module is imported (Jest `setupFiles`). Provides the
 * environment the app validates at import time so tests can run against a
 * local Postgres + Redis. DEMO_MODE keeps Twilio out of the loop.
 */
process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.LOG_LEVEL ??= 'error';
process.env.DATABASE_URL ??= 'postgresql://rightnow:rightnow@localhost:5432/rightnow';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
process.env.CLIENT_ORIGIN ??= 'http://localhost:5173';

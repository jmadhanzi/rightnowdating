import pg from 'pg';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool (max 20 connections by default; configurable
 * via POSTGRES_POOL_MAX). PostGIS is expected to be enabled on the target
 * database (see migrations/001_enable_extensions.sql).
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.POSTGRES_POOL_MAX,
  ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle Postgres client');
});

/**
 * Run a parameterized query against the pool. Always pass user-supplied values
 * via `params` ($1, $2, ...) — never interpolate them into `text`.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params as never[]);
  logger.debug({ text, rows: res.rowCount, ms: Date.now() - start }, 'db query');
  return res;
}

/**
 * Run `fn` inside a single transaction. Commits on success, rolls back on any
 * thrown error, and always releases the client back to the pool.
 */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Lightweight liveness check used by the /health endpoint and probes. */
export async function healthCheck(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return false;
  }
}

/** Verify connectivity and that PostGIS is installed (run at boot). */
export async function verifyDatabase(): Promise<void> {
  const { rows } = await pool.query<{ postgis_version: string }>(
    'SELECT postgis_version() AS postgis_version',
  );
  logger.info({ postgis: rows[0]?.postgis_version }, 'Connected to Postgres + PostGIS');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

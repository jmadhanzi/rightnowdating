import pg from 'pg';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool. PostGIS is expected to be enabled on the
 * target database (see db/init.sql).
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.POSTGRES_POOL_MAX,
  ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle Postgres client');
});

/** Thin typed query helper. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params as never[]);
  logger.debug({ text, rows: res.rowCount, ms: Date.now() - start }, 'db query');
  return res;
}

/** Verify connectivity and that PostGIS is installed. */
export async function verifyDatabase(): Promise<void> {
  const { rows } = await pool.query<{ postgis_version: string }>(
    'SELECT postgis_version() AS postgis_version',
  );
  logger.info({ postgis: rows[0]?.postgis_version }, 'Connected to Postgres + PostGIS');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/**
 * Migration runner. Applies every `*.sql` file in ./migrations (in filename
 * order) that has not already been recorded in `schema_migrations`. Each
 * migration runs in its own transaction, so a failure rolls back cleanly.
 *
 * Usage: `npm run db:migrate` (from /server) or `tsx src/db/migrate.ts`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './index.js';
import { logger } from '../utils/logger.js';

const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

async function getExecuted(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const executed = await getExecuted();

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

  const pending = files.filter((f) => !executed.has(f));

  if (pending.length === 0) {
    logger.info('Database is up to date — no pending migrations.');
    return;
  }

  logger.info(`Found ${pending.length} pending migration(s).`);

  for (const file of pending) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info(`✓ applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, file }, `✗ migration failed (rolled back): ${file}`);
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info(`Done — applied ${pending.length} migration(s).`);
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    logger.error({ err }, 'Migration run aborted');
    await pool.end().catch(() => undefined);
    process.exit(1);
  });

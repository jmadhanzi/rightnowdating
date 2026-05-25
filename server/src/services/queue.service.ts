import Queue, { type Job } from 'bull';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { emitToUser, emitToCity } from '../socket/emitter.js';
import { sendSms } from './twilio.service.js';
import { sendToUser } from './notifications.service.js';

export interface CheckinJob {
  matchId: string;
  round: number;
}

export interface NotificationJob {
  type: 'sms';
  to: string;
  body: string;
}

export interface BoostExpiryJob {
  boostId: string;
  sessionId: string;
  city: string;
}

export const BOOST_DURATION_MS = 60 * 60 * 1000;

// Bull manages its own Redis connections from the same REDIS_URL.
export const safetyCheckQueue = new Queue<CheckinJob>('safety-check', env.REDIS_URL);
export const notificationQueue = new Queue<NotificationJob>('notification', env.REDIS_URL);
export const boostExpiryQueue = new Queue<BoostExpiryJob>('boost-expiry', env.REDIS_URL);
export const creditGrantQueue = new Queue<Record<string, never>>('credit-grant', env.REDIS_URL);

const PENDING_TTL_SECONDS = 600; // 10 minutes to confirm a check-in
const ESCALATE_DELAY_MS = 10 * 60 * 1000;
const SECOND_CHECKIN_DELAY_MS = 30 * 60 * 1000;

const pendingKey = (matchId: string, userId: string): string =>
  `checkin:pending:${matchId}:${userId}`;

async function getMatchUsersAndVenue(matchId: string): Promise<{
  users: string[];
  venueName: string;
  venueAddress: string;
} | null> {
  const { rows } = await pool.query<{
    user1_id: string;
    user2_id: string;
    venue_id: string | null;
  }>('SELECT user1_id, user2_id, venue_id FROM matches WHERE id = $1', [matchId]);
  const match = rows[0];
  if (!match) return null;

  let venueName = 'their meetup location';
  let venueAddress = '';
  if (match.venue_id) {
    const v = await pool.query<{ name: string; address: string }>(
      'SELECT name, address FROM venues WHERE id = $1',
      [match.venue_id],
    );
    if (v.rows[0]) {
      venueName = v.rows[0].name;
      venueAddress = v.rows[0].address;
    }
  }
  return { users: [match.user1_id, match.user2_id], venueName, venueAddress };
}

async function displayName(userId: string): Promise<string> {
  const { rows } = await pool.query<{ display_name: string }>(
    'SELECT display_name FROM profiles WHERE id = $1',
    [userId],
  );
  return rows[0]?.display_name ?? 'Your contact';
}

// --- Processors -------------------------------------------------------------
async function processCheckin(job: Job<CheckinJob>): Promise<void> {
  const { matchId, round } = job.data;
  const info = await getMatchUsersAndVenue(matchId);
  if (!info) return;

  for (const userId of info.users) {
    emitToUser(userId, 'date:checkin:ping', { matchId });
    await redis.set(pendingKey(matchId, userId), '1', 'EX', PENDING_TTL_SECONDS);
  }

  // Escalate if no confirmation within 10 minutes.
  await safetyCheckQueue.add('escalate', { matchId, round }, { delay: ESCALATE_DELAY_MS });

  // Schedule a single follow-up check-in (meetup + 60 min).
  if (round === 1) {
    await safetyCheckQueue.add(
      'checkin',
      { matchId, round: 2 },
      { delay: SECOND_CHECKIN_DELAY_MS },
    );
  }
}

async function processEscalation(job: Job<CheckinJob>): Promise<void> {
  const { matchId } = job.data;
  const info = await getMatchUsersAndVenue(matchId);
  if (!info) return;

  for (const userId of info.users) {
    const stillPending = await redis.get(pendingKey(matchId, userId));
    if (!stillPending) continue; // user confirmed safe

    const name = await displayName(userId);
    const contacts = await pool.query<{ contact_phone: string }>(
      'SELECT contact_phone FROM trusted_contacts WHERE user_id = $1',
      [userId],
    );
    const body =
      `RIGHTNOW safety check: ${name} hasn't confirmed they're safe after a date at ` +
      `${info.venueName}, ${info.venueAddress}. Please check on them.`;
    for (const c of contacts.rows) {
      await sendSms(c.contact_phone, body).catch((err) =>
        logger.error({ err }, 'failed to send escalation SMS'),
      );
    }
    await redis.del(pendingKey(matchId, userId));
  }
}

async function processNotification(job: Job<NotificationJob>): Promise<void> {
  if (job.data.type === 'sms') {
    await sendSms(job.data.to, job.data.body);
  }
}

async function processBoostExpiry(job: Job<BoostExpiryJob>): Promise<void> {
  const { boostId, sessionId, city } = job.data;
  await pool.query('UPDATE boosts SET is_active = false WHERE id = $1', [boostId]);
  emitToCity(city, 'map:pin:updated', { sessionId, isBoosted: false });
}

async function processMonthlyCredits(): Promise<void> {
  const { rows } = await pool.query<{ user_id: string }>(
    "SELECT DISTINCT user_id FROM subscriptions WHERE plan = 'vip' AND status IN ('active', 'trialing', 'cancelling')",
  );
  for (const { user_id } of rows) {
    await pool.query('UPDATE users SET boost_credits = 5 WHERE id = $1', [user_id]);
    await sendToUser(user_id, {
      title: '🎁 Boost credits refreshed',
      body: 'Your 5 monthly boost credits have been refreshed!',
    });
  }
  logger.info({ count: rows.length }, 'monthly VIP boost credits granted');
}

safetyCheckQueue.process('checkin', processCheckin);
safetyCheckQueue.process('escalate', processEscalation);
notificationQueue.process(processNotification);
boostExpiryQueue.process('expire', processBoostExpiry);
creditGrantQueue.process('grant', processMonthlyCredits);

/** Add a 1-hour delayed boost-expiry job. */
export async function scheduleBoostExpiry(
  boostId: string,
  sessionId: string,
  city: string,
): Promise<void> {
  await boostExpiryQueue.add('expire', { boostId, sessionId, city }, { delay: BOOST_DURATION_MS });
}

/** Register the monthly (1st of month) VIP credit-grant cron. Idempotent. */
export async function scheduleMonthlyCredits(): Promise<void> {
  await creditGrantQueue.add({}, { repeat: { cron: '0 0 1 * *' }, jobId: 'monthly-vip-credits' });
}

// --- Global failure logging -------------------------------------------------
async function logJobFailure(queueName: string, job: Job | undefined, err: Error): Promise<void> {
  await pool
    .query(
      `INSERT INTO job_failures (queue_name, job_id, job_name, data, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [queueName, String(job?.id ?? ''), job?.name ?? '', job?.data ?? null, err.message],
    )
    .catch((e) => logger.error({ e }, 'failed to persist job failure'));
}

safetyCheckQueue.on('failed', (job, err) => {
  logger.error({ err, jobId: job.id }, 'safety-check job failed');
  void logJobFailure('safety-check', job, err);
});
notificationQueue.on('failed', (job, err) => {
  logger.error({ err, jobId: job.id }, 'notification job failed');
  void logJobFailure('notification', job, err);
});
boostExpiryQueue.on('failed', (job, err) => {
  logger.error({ err, jobId: job.id }, 'boost-expiry job failed');
  void logJobFailure('boost-expiry', job, err);
});
creditGrantQueue.on('failed', (job, err) => {
  logger.error({ err, jobId: job.id }, 'credit-grant job failed');
  void logJobFailure('credit-grant', job, err);
});

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    safetyCheckQueue.close(),
    notificationQueue.close(),
    boostExpiryQueue.close(),
    creditGrantQueue.close(),
  ]);
}

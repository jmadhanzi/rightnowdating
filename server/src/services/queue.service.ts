import Queue, { type Job } from 'bull';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { emitToUser, emitToCity } from '../socket/emitter.js';
import { sendSms } from './twilio.service.js';
import { sendToUser, sendIdleMatchNudge } from './notifications.service.js';

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
export const idleNudgeQueue = new Queue<Record<string, never>>('idle-nudge', env.REDIS_URL);

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
  if (rows.length === 0) return;

  const userIds = rows.map((r) => r.user_id);

  // Single UPDATE for all VIP users — far faster than N individual queries.
  await pool.query(
    'UPDATE users SET boost_credits = GREATEST(boost_credits, 5) WHERE id = ANY($1)',
    [userIds],
  );

  // Push notifications in parallel batches of 100.
  const BATCH = 100;
  for (let i = 0; i < userIds.length; i += BATCH) {
    await Promise.all(
      userIds.slice(i, i + BATCH).map((id) =>
        sendToUser(id, {
          title: '🎁 Boost credits refreshed',
          body: 'Your 5 monthly boost credits have been refreshed!',
        }),
      ),
    );
  }
  logger.info({ count: userIds.length }, 'monthly VIP boost credits granted');
}

async function processIdleMatchNudges(): Promise<void> {
  // Find matched conversations where one user sent a message 24-48h ago but the other hasn't replied
  const { rows } = await pool.query<{
    match_id: string;
    sender_id: string;
    sender_name: string;
    silent_user_id: string;
    last_message_content: string;
  }>(`
    SELECT DISTINCT ON (m.id)
      m.id AS match_id,
      msg.sender_id,
      p_sender.display_name AS sender_name,
      CASE WHEN m.user1_id = msg.sender_id THEN m.user2_id ELSE m.user1_id END AS silent_user_id,
      msg.content AS last_message_content
    FROM matches m
    JOIN messages msg ON msg.match_id = m.id
    JOIN profiles p_sender ON p_sender.id = msg.sender_id
    WHERE m.status IN ('matched', 'pending')
      AND msg.created_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '23 hours'
      AND NOT EXISTS (
        SELECT 1 FROM messages reply
        WHERE reply.match_id = m.id
          AND reply.sender_id != msg.sender_id
          AND reply.created_at > msg.created_at
      )
    ORDER BY m.id, msg.created_at DESC
    LIMIT 200
  `);

  if (rows.length === 0) return;

  // Dedupe nudges — only one per silent user per day
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (row) => {
        const nudgeKey = `idle_nudge:${row.match_id}:${row.silent_user_id}`;
        const alreadyNudged = await redis.set(nudgeKey, '1', 'EX', 24 * 60 * 60, 'NX');
        if (alreadyNudged !== 'OK') return; // already sent today

        // Extract a 2-word topic hint from the message for the nudge
        const words = row.last_message_content.trim().split(' ');
        const topic = words.length > 3 ? words.slice(0, 3).join(' ') + '…' : undefined;

        await sendIdleMatchNudge(
          row.silent_user_id,
          row.sender_name,
          row.match_id,
          topic,
        );
      }),
    );
  }
  logger.info({ count: rows.length }, 'idle match nudges sent');
}

safetyCheckQueue.process('checkin', processCheckin);
safetyCheckQueue.process('escalate', processEscalation);
notificationQueue.process(processNotification);
boostExpiryQueue.process('expire', processBoostExpiry);
creditGrantQueue.process('grant', processMonthlyCredits);
idleNudgeQueue.process('scan', processIdleMatchNudges);

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

/** Run idle match nudge scan every hour. Idempotent. */
export async function scheduleIdleNudges(): Promise<void> {
  await idleNudgeQueue.add({}, { repeat: { cron: '0 * * * *' }, jobId: 'idle-match-nudge-scan' });
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
    idleNudgeQueue.close(),
  ]);
}

import webpush, { type PushSubscription } from 'web-push';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { emitToUser } from '../socket/emitter.js';

let vapidReady = false;

/** Configure web-push, or generate+log a key pair for first-time setup. */
export function setupWebPush(): boolean {
  if (vapidReady) return true;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidReady = true;
    return true;
  }
  const keys = webpush.generateVAPIDKeys();
  logger.warn(
    { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey },
    'VAPID keys not configured — generated a pair for first-time setup. Add them to your env.',
  );
  return false;
}

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  ttl?: number;
}

/**
 * Send a Web Push to every subscription a user has, pruning expired ones.
 * Never throws; logs success/failure counts.
 */
export async function sendToUser(userId: string, notification: PushNotification): Promise<void> {
  if (!setupWebPush()) return;

  const { rows } = await pool.query<{ id: string; subscription: PushSubscription }>(
    'SELECT id, subscription FROM user_push_subscriptions WHERE user_id = $1',
    [userId],
  );
  if (rows.length === 0) return;

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    data: notification.data ?? {},
  });
  const options = notification.ttl ? { TTL: notification.ttl } : undefined;

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload, options);
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await pool
            .query('DELETE FROM user_push_subscriptions WHERE id = $1', [row.id])
            .catch(() => undefined);
        } else {
          logger.warn({ err }, 'web push failed');
        }
        failed += 1;
      }
    }),
  );
  logger.debug({ userId, sent, failed }, 'push delivered');
}

/** In-app (socket) + Web Push notification. */
export async function sendPushNotification(
  userId: string,
  notification: PushNotification,
): Promise<void> {
  emitToUser(userId, 'notification', { title: notification.title, body: notification.body });
  await sendToUser(userId, notification);
}

// ---------------------------------------------------------------------------
// Typed notifications
// ---------------------------------------------------------------------------
export function sendSparkAlert(
  userId: string,
  spark: { sparkId: string; name: string; age: number | null; vibe: string; distance: string },
): Promise<void> {
  return sendToUser(userId, {
    title: '⚡ New Spark!',
    body: `${spark.name}${spark.age ? ` ${spark.age}` : ''} wants to meet up · ${spark.vibe} · ${spark.distance}`,
    data: { type: 'spark', sparkId: spark.sparkId },
    ttl: 420,
  });
}

export function sendMatchCreated(
  userId: string,
  match: { matchId: string; name: string; venue: string },
): Promise<void> {
  return sendToUser(userId, {
    title: "🔥 It's a Match!",
    body: `You and ${match.name} are meeting at ${match.venue}. Get ready!`,
    data: { type: 'match', matchId: match.matchId },
  });
}

export function sendSessionExpiring(userId: string, sessionId: string): Promise<void> {
  return sendToUser(userId, {
    title: '⏰ 5 minutes left!',
    body: 'Your RIGHTNOW session expires soon. Still out?',
    data: { type: 'session_expiring', sessionId },
  });
}

export function sendCityHeatingUp(userId: string, count: number, city: string): Promise<void> {
  return sendToUser(userId, {
    title: `🌃 ${city} is heating up`,
    body: `${count} people are live near you right now.`,
    data: { type: 'city_pulse' },
  });
}

export function sendDateCheckin(userId: string, matchId: string): Promise<void> {
  return sendToUser(userId, {
    title: '🛡️ Quick check-in',
    body: "How's the date going? Tap to confirm you're safe.",
    data: { type: 'safety_checkin', matchId },
  });
}

export async function sendRewardUnlocked(
  userId: string,
  rewardName: string,
  referredName?: string,
): Promise<void> {
  await sendToUser(userId, {
    title: '🎁 Reward unlocked!',
    body: referredName
      ? `You earned ${rewardName} for referring ${referredName}!`
      : `You earned ${rewardName}!`,
    data: { type: 'reward' },
  });
}

/** Reward unlock: in-app event + push. */
export async function notifyReward(
  userId: string,
  reward: { tier: number; reward: string },
): Promise<void> {
  emitToUser(userId, 'reward:granted', reward);
  await sendRewardUnlocked(userId, reward.reward);
}

/**
 * Broadcast a city activity push to dormant users with complete profiles,
 * deduped to one city push per user per 4 hours, in batches of 100.
 */
export async function sendCityActivity(
  city: string,
  notification: PushNotification,
  hoursInactive: number,
): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id
       FROM users u JOIN profiles p ON p.id = u.id
      WHERE LOWER(p.city) = $1
        AND u.is_banned = false AND u.is_suspended = false
        AND p.age IS NOT NULL AND p.display_name <> 'New User'
        AND (u.last_active IS NULL OR u.last_active < NOW() - make_interval(hours => $2))`,
    [city.toLowerCase(), hoursInactive],
  );

  // Filter to users not recently notified.
  const eligible: string[] = [];
  for (const { id } of rows) {
    const fresh = await redis.set(`city_notif:${id}`, '1', 'EX', 4 * 60 * 60, 'NX');
    if (fresh === 'OK') eligible.push(id);
  }

  const BATCH = 100;
  for (let i = 0; i < eligible.length; i += BATCH) {
    const batch = eligible.slice(i, i + BATCH);
    await Promise.all(batch.map((id) => sendToUser(id, notification)));
  }
  logger.info({ city, count: eligible.length }, 'city activity broadcast');
  return eligible.length;
}

import webpush, { type PushSubscription } from 'web-push';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { emitToUser } from '../socket/emitter.js';

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidReady = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Notify a user in-app (socket) and, when VAPID is configured, via Web Push to
 * every stored subscription. Fail-safe — never throws.
 */
export async function sendPushNotification(userId: string, payload: PushPayload): Promise<void> {
  emitToUser(userId, 'notification', { title: payload.title, body: payload.body });

  if (!ensureVapid()) return;

  const { rows } = await pool.query<{ id: string; subscription: PushSubscription }>(
    'SELECT id, subscription FROM user_push_subscriptions WHERE user_id = $1',
    [userId],
  );

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the subscription is dead — prune it.
        if (statusCode === 404 || statusCode === 410) {
          await pool
            .query('DELETE FROM user_push_subscriptions WHERE id = $1', [row.id])
            .catch(() => undefined);
        } else {
          logger.warn({ err }, 'web push send failed');
        }
      }
    }),
  );
}

/** Reward-specific notification: in-app event + push. */
export async function notifyReward(
  userId: string,
  reward: { tier: number; reward: string },
): Promise<void> {
  emitToUser(userId, 'reward:granted', reward);
  await sendPushNotification(userId, {
    title: 'Reward unlocked! 🎉',
    body: reward.reward,
  });
}

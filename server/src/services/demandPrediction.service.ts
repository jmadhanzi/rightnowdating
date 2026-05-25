import cron from 'node-cron';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { sendPushNotification } from './push.service.js';

const WEEKS = 4; // 28 days → 4 occurrences of each weekday/hour
const DEDUP_TTL = 4 * 60 * 60; // one demand push per user / 4h
const LOW_FACTOR = 0.7;
const HIGH_FACTOR = 1.3;
const MIN_PREDICTED = 15;

export interface DemandResult {
  city: string;
  predictedAvg: number;
  currentCount: number;
  action: 'high' | 'low' | 'none';
  notified: number;
}

/**
 * Compare a city's current live-session count to its rolling average for this
 * hour-of-day / day-of-week, and nudge dormant users on notable demand swings.
 * Never throws.
 */
export async function runCityPrediction(city: string): Promise<DemandResult> {
  const cityKey = city.toLowerCase();
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();

  try {
    const histRes = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
         FROM live_sessions ls JOIN profiles p ON p.id = ls.user_id
        WHERE LOWER(p.city) = $1
          AND ls.created_at > NOW() - INTERVAL '28 days'
          AND EXTRACT(HOUR FROM ls.created_at) = $2
          AND EXTRACT(DOW FROM ls.created_at) = $3`,
      [cityKey, hour, dow],
    );
    const predictedAvg = (histRes.rows[0]?.c ?? 0) / WEEKS;

    const currentRes = await pool.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c
         FROM live_sessions ls JOIN profiles p ON p.id = ls.user_id
        WHERE LOWER(p.city) = $1 AND ls.is_active = true AND ls.expires_at > NOW()`,
      [cityKey],
    );
    const currentCount = currentRes.rows[0]?.c ?? 0;

    let action: DemandResult['action'] = 'none';
    let message = '';
    if (predictedAvg > 0 && currentCount > predictedAvg * HIGH_FACTOR) {
      action = 'high';
      message = `🔥 ${city} is popping right now — ${currentCount} people are live. Go meet someone.`;
    } else if (predictedAvg > MIN_PREDICTED && currentCount < predictedAvg * LOW_FACTOR) {
      action = 'low';
      message = `It's quiet in ${city} tonight — go live and be the first to spark.`;
    }

    if (action === 'none') {
      return { city, predictedAvg, currentCount, action, notified: 0 };
    }

    // Eligible: complete profile, dormant 6h+.
    const eligible = await pool.query<{ id: string }>(
      `SELECT u.id
         FROM users u JOIN profiles p ON p.id = u.id
        WHERE LOWER(p.city) = $1
          AND u.is_banned = false AND u.is_suspended = false
          AND p.age IS NOT NULL AND p.display_name <> 'New User'
          AND (u.last_active IS NULL OR u.last_active < NOW() - INTERVAL '6 hours')`,
      [cityKey],
    );

    let notified = 0;
    for (const { id } of eligible.rows) {
      const key = `demand:sent:${id}`;
      const fresh = await redis.set(key, '1', 'EX', DEDUP_TTL, 'NX');
      if (fresh === 'OK') {
        await sendPushNotification(id, { title: 'RIGHTNOW', body: message });
        notified += 1;
      }
    }

    logger.info({ city, action, predictedAvg, currentCount, notified }, 'demand prediction run');
    return { city, predictedAvg, currentCount, action, notified };
  } catch (err) {
    logger.error({ err, city }, 'demand prediction failed');
    return { city, predictedAvg: 0, currentCount: 0, action: 'none', notified: 0 };
  }
}

let cronTask: cron.ScheduledTask | null = null;

/** Schedule hourly demand prediction for Miami. */
export function startDemandCron(): void {
  if (cronTask) return;
  cronTask = cron.schedule('0 * * * *', () => {
    void runCityPrediction('miami');
  });
  logger.info('Demand-prediction cron scheduled (hourly)');
}

export function stopDemandCron(): void {
  cronTask?.stop();
  cronTask = null;
}

import cron from 'node-cron';
import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { sendCityActivity } from './notifications.service.js';

const WEEKS = 4; // 28 days → 4 occurrences of each weekday/hour
const DORMANT_HOURS = 6;
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

    const title = action === 'high' ? `🌃 ${city} is heating up` : 'RIGHTNOW';
    const notified = await sendCityActivity(
      city,
      { title, body: message, data: { type: 'city_pulse' } },
      DORMANT_HOURS,
    );

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

import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { sendToUser } from './notifications.service.js';
import { sendStreakAtRiskNotifications, refreshCityLeaderboard } from './streak.service.js';
import { refreshWeeklyStats } from './wrapped.service.js';

// ---------------------------------------------------------------------------
// Peak hour notification — fires Thu/Fri/Sat/Sun at 7pm
// "The city is live right now — X people went live in the last hour"
// ---------------------------------------------------------------------------
export async function sendPeakHourAlerts(): Promise<void> {
  const now = new Date();
  const hour = now.getUTCHours();
  const day  = now.getUTCDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat

  // Only fire on Thu–Sun evenings 18:00–21:00 UTC (≈ 6–9pm local for US East)
  if (!([0, 4, 5, 6].includes(day)) || hour < 18 || hour > 21) return;

  // Count users live in the last 60 minutes, grouped by city
  const { rows: cities } = await pool.query<{
    city: string;
    live_count: string;
  }>(
    `SELECT p.city, COUNT(*) AS live_count
       FROM live_sessions ls
       JOIN profiles p ON p.id = ls.user_id
      WHERE ls.is_active = true
        AND ls.created_at > NOW() - INTERVAL '60 minutes'
      GROUP BY p.city
     HAVING COUNT(*) >= 5
      ORDER BY COUNT(*) DESC`,
  );

  for (const cityRow of cities) {
    const liveCount = Number(cityRow.live_count);
    const cityName  = cityRow.city;

    // Find users in this city who have NOT gone live today and have peak alerts on
    const { rows: targets } = await pool.query<{ user_id: string }>(
      `SELECT u.id AS user_id
         FROM users u
         JOIN profiles p ON p.id = u.id
         LEFT JOIN notification_preferences np ON np.user_id = u.id
        WHERE p.city = $1
          AND (np.peak_hour_alerts IS NULL OR np.peak_hour_alerts = true)
          AND NOT EXISTS (
            SELECT 1 FROM live_sessions ls2
            WHERE ls2.user_id = u.id
              AND ls2.created_at > NOW() - INTERVAL '4 hours'
          )
          AND EXISTS (
            SELECT 1 FROM user_push_subscriptions ups
            WHERE ups.user_id = u.id
          )
        LIMIT 200`,
      [cityName],
    );

    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayLabel  = dayLabels[day] ?? 'Tonight';

    const messages = [
      { title: `🌙 ${cityName} is heating up`,        body: `${liveCount} people just went live. ${dayLabel} night starts now.` },
      { title: `⚡ ${liveCount} people live in ${cityName}`,  body: `Right now. Will you be one of them tonight?` },
      { title: `🔥 Peak hour in ${cityName}`,          body: `${liveCount} people out there looking. Your city is ready.` },
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)]!;

    // Dedup: one peak-hour alert per user per evening
    const batchKey = `peak:${cityName}:${now.toISOString().slice(0, 13)}`;
    const alreadySent = await redis.set(batchKey, '1', 'EX', 3600, 'NX');
    if (alreadySent !== 'OK') continue;

    let sent = 0;
    for (const { user_id } of targets) {
      await sendToUser(user_id, { ...msg, data: { type: 'peak_hour', city: cityName } }).catch(() => undefined);
      sent++;
    }
    logger.info({ city: cityName, liveCount, notified: sent }, 'peak hour alert sent');
  }
}

// ---------------------------------------------------------------------------
// Weekly Wrapped delivery — fires Sunday evening
// ---------------------------------------------------------------------------
export async function deliverWeeklyWrapped(): Promise<void> {
  const now = new Date();
  if (now.getUTCDay() !== 0 || now.getUTCHours() !== 19) return; // Sunday 7pm UTC only

  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekStr = weekStart.toISOString().slice(0, 10);

  // Refresh stats first
  await refreshWeeklyStats(weekStr);

  // Find users who were active this week
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM live_sessions
      WHERE created_at >= $1::date AND created_at < ($1::date + INTERVAL '7 days')`,
    [weekStr],
  );

  logger.info({ count: rows.length, weekStr }, 'delivering weekly wrapped');

  for (const { user_id } of rows) {
    const prefCheck = await pool.query<{ weekly_wrapped: boolean }>(
      'SELECT weekly_wrapped FROM notification_preferences WHERE user_id = $1',
      [user_id],
    );
    if (prefCheck.rows[0]?.weekly_wrapped === false) continue;

    await sendToUser(user_id, {
      title: '📊 Your week on RIGHTNOW',
      body: 'Your weekly recap is ready — see how your nights played out.',
      data: { type: 'weekly_wrapped', weekStart: weekStr },
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Compatibility preview — sends "Someone nearby matches your vibe" at 6pm Thu-Sun
// ---------------------------------------------------------------------------
export async function sendCompatibilityPreviews(): Promise<void> {
  const now = new Date();
  const hour = now.getUTCHours();
  const day  = now.getUTCDay();
  if (!([0, 4, 5, 6].includes(day)) || hour !== 18) return; // only fire at 6pm on live nights

  // Find users who have NOT yet gone live today but went live in the past 30 days
  const { rows } = await pool.query<{
    user_id: string;
    city: string;
    preferred_vibes: string[];
    compatible_count: string;
  }>(
    `SELECT p.id AS user_id, p.city, p.preferred_vibes,
            (SELECT COUNT(*) FROM live_sessions ls2
              JOIN profiles p2 ON p2.id = ls2.user_id
              WHERE ls2.is_active = true
                AND ls2.user_id != p.id
                AND (ls2.vibe = ANY(p.preferred_vibes) OR p.preferred_vibes IS NULL)
                AND ST_DWithin(
                  ls2.fuzzy_location::geography,
                  (SELECT fuzzy_location FROM live_sessions ls3
                    WHERE ls3.user_id = p.id
                      AND ls3.is_active = true LIMIT 1)::geography,
                  5000
                )
            ) AS compatible_count
       FROM profiles p
      WHERE EXISTS (
        SELECT 1 FROM live_sessions ls
        WHERE ls.user_id = p.id
          AND ls.created_at > NOW() - INTERVAL '30 days'
      )
      AND NOT EXISTS (
        SELECT 1 FROM live_sessions ls2
        WHERE ls2.user_id = p.id AND ls2.created_at > NOW() - INTERVAL '3 hours'
      )
      AND EXISTS (SELECT 1 FROM user_push_subscriptions ups WHERE ups.user_id = p.id)
      LIMIT 300`,
  );

  for (const r of rows) {
    const count = Number(r.compatible_count);
    if (count < 2) continue;

    const vibeLabel = r.preferred_vibes?.[0] ?? 'your vibe';
    await sendToUser(r.user_id, {
      title: `✨ ${count} compatible ${count === 1 ? 'person' : 'people'} live near you`,
      body: `They're into ${vibeLabel} too. Tonight could be good.`,
      data: { type: 'compatibility_preview', compatibleCount: count },
    }).catch(() => undefined);
  }
}

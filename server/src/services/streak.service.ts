import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { sendToUser } from './notifications.service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// A "night" counts Thursday–Sunday between 17:00–02:00 local.
// We approximate UTC for now; a city timezone column can refine this later.
const NIGHT_DAYS = [0, 4, 5, 6]; // Sun=0, Thu=4, Fri=5, Sat=6
const NIGHT_HOURS_START = 17;     // 5pm
const NIGHT_HOURS_END   = 2;      // 2am next day (handled below)

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastLiveNight: string | null;
  totalLiveNights: number;
  isActive: boolean; // went live this week's Thu-Sun window
}

/** Is `date` a "night" (Thu-Sun, 5pm–2am)? */
export function isLiveNight(date: Date): boolean {
  const day  = date.getUTCDay();
  const hour = date.getUTCHours();
  const isLateNight = hour < NIGHT_HOURS_END; // 0:00–1:59 still counts as previous night
  const effectiveDay = isLateNight && day > 0 ? day - 1 : isLateNight ? 6 : day;
  const isNightHour  = hour >= NIGHT_HOURS_START || hour < NIGHT_HOURS_END;
  return NIGHT_DAYS.includes(effectiveDay) && isNightHour;
}

/** Date string for "tonight's calendar date" (handles 0–2am rolling into prev day). */
function nightDate(date: Date): string {
  const d = new Date(date);
  if (d.getUTCHours() < NIGHT_HOURS_END) {
    d.setUTCDate(d.getUTCDate() - 1); // treat as yesterday
  }
  return d.toISOString().slice(0, 10);
}

/** Number of days between two ISO date strings. */
function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24),
  );
}

// ---------------------------------------------------------------------------
// Core streak update — called every time a user successfully goes live
// ---------------------------------------------------------------------------
export async function recordGoLiveForStreak(userId: string): Promise<StreakInfo> {
  const now = new Date();

  if (!isLiveNight(now)) {
    // Not a qualifying night — don't update streak but return current state
    return getStreakInfo(userId);
  }

  const tonight = nightDate(now);

  // Upsert the streak row
  const { rows } = await pool.query<{
    current_streak: number;
    longest_streak: number;
    last_live_night: string | null;
    total_live_nights: number;
  }>(
    `INSERT INTO night_streaks (user_id, current_streak, longest_streak, last_live_night, total_live_nights)
     VALUES ($1, 0, 0, NULL, 0)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING current_streak, longest_streak, last_live_night, total_live_nights`,
    [userId],
  );

  // Re-fetch (handles both insert and existing row)
  const current = await pool.query<{
    current_streak: number;
    longest_streak: number;
    last_live_night: string | null;
    total_live_nights: number;
  }>(
    'SELECT current_streak, longest_streak, last_live_night, total_live_nights FROM night_streaks WHERE user_id = $1',
    [userId],
  );
  const s = current.rows[0] ?? { current_streak: 0, longest_streak: 0, last_live_night: null, total_live_nights: 0 };

  // Already counted tonight
  if (s.last_live_night === tonight) {
    return { currentStreak: s.current_streak, longestStreak: s.longest_streak, lastLiveNight: tonight, totalLiveNights: s.total_live_nights, isActive: true };
  }

  // Determine new streak
  let newStreak = 1;
  if (s.last_live_night) {
    const gap = daysBetween(tonight, s.last_live_night);
    // Allow up to 8 days gap (skipped one weekend) to continue streak
    if (gap <= 8) {
      newStreak = s.current_streak + 1;
    }
  }
  const newLongest = Math.max(newStreak, s.longest_streak);
  const newTotal   = s.total_live_nights + 1;

  await pool.query(
    `UPDATE night_streaks
        SET current_streak = $2, longest_streak = $3, last_live_night = $4,
            total_live_nights = $5, updated_at = NOW()
      WHERE user_id = $1`,
    [userId, newStreak, newLongest, tonight, newTotal],
  );

  // Push milestone notifications
  void notifyStreakMilestone(userId, newStreak).catch(() => undefined);

  logger.info({ userId, newStreak, tonight }, 'night streak updated');
  return { currentStreak: newStreak, longestStreak: newLongest, lastLiveNight: tonight, totalLiveNights: newTotal, isActive: true };
}

/** Retrieve streak info for a user without updating it. */
export async function getStreakInfo(userId: string): Promise<StreakInfo> {
  const { rows } = await pool.query<{
    current_streak: number;
    longest_streak: number;
    last_live_night: string | null;
    total_live_nights: number;
  }>(
    'SELECT current_streak, longest_streak, last_live_night, total_live_nights FROM night_streaks WHERE user_id = $1',
    [userId],
  );
  if (!rows[0]) return { currentStreak: 0, longestStreak: 0, lastLiveNight: null, totalLiveNights: 0, isActive: false };
  const s = rows[0];
  const tonight = nightDate(new Date());
  return {
    currentStreak:   s.current_streak,
    longestStreak:   s.longest_streak,
    lastLiveNight:   s.last_live_night,
    totalLiveNights: s.total_live_nights,
    isActive:        s.last_live_night === tonight,
  };
}

/** Push a notification when the user hits a streak milestone. */
async function notifyStreakMilestone(userId: string, streak: number): Promise<void> {
  const milestones: Record<number, { title: string; body: string }> = {
    3:  { title: '🔥 3-night streak!',     body: "Three nights out in a row. You're building something." },
    5:  { title: '🔥🔥 5-night streak!',  body: "Five consecutive nights live. Top 10% of the city." },
    7:  { title: '⚡ Weekly legend',       body: "Seven straight nights. Your city knows your name." },
    10: { title: '👑 10-night streak',     body: "Ten nights and counting. You ARE the nightlife." },
    14: { title: '🏆 2-week warrior',      body: "Two weeks live every night. Absolute legend status." },
  };
  const notif = milestones[streak];
  if (!notif) return;

  // Dedup: only notify once per milestone
  const key = `streak:milestone:${userId}:${streak}`;
  const already = await redis.set(key, '1', 'EX', 60 * 60 * 24 * 30, 'NX');
  if (already !== 'OK') return;

  await sendToUser(userId, { ...notif, data: { type: 'streak_milestone', streak } });
}

// ---------------------------------------------------------------------------
// Streak Risk — cron that fires Thursday 6pm to remind users their streak
// is at risk if they don't go live this weekend
// ---------------------------------------------------------------------------
export async function sendStreakAtRiskNotifications(): Promise<void> {
  // Find users with streak >= 2 who haven't gone live this week yet
  const lastThursday = new Date();
  lastThursday.setUTCDate(lastThursday.getUTCDate() - ((lastThursday.getUTCDay() + 3) % 7));
  lastThursday.setUTCHours(0, 0, 0, 0);

  const { rows } = await pool.query<{
    user_id: string;
    current_streak: number;
    display_name: string;
  }>(
    `SELECT ns.user_id, ns.current_streak, p.display_name
       FROM night_streaks ns
       JOIN profiles p ON p.id = ns.user_id
      WHERE ns.current_streak >= 2
        AND ns.last_live_night < $1::text
        AND EXISTS (
          SELECT 1 FROM user_push_subscriptions ups
          WHERE ups.user_id = ns.user_id
        )
      LIMIT 500`,
    [lastThursday.toISOString().slice(0, 10)],
  );

  logger.info({ count: rows.length }, 'sending streak-at-risk notifications');
  for (const r of rows) {
    const body =
      r.current_streak >= 7
        ? `Your ${r.current_streak}-night streak ends tonight if you don't go live. Don't break it! 🔥`
        : `You've been live ${r.current_streak} nights in a row. Keep it going tonight!`;
    await sendToUser(r.user_id, {
      title: '⏰ Your streak is at risk',
      body,
      data: { type: 'streak_at_risk', streak: r.current_streak },
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// City Leaderboard — refreshed weekly
// ---------------------------------------------------------------------------
export async function refreshCityLeaderboard(): Promise<void> {
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // last Sunday
  const weekStr = weekStart.toISOString().slice(0, 10);

  await pool.query(`
    INSERT INTO city_leaderboard_weekly (city, week_start, user_id, rank, nights_live, matches_made, display_name, avatar_emoji)
    SELECT
      p.city,
      $1::date,
      p.id,
      RANK() OVER (PARTITION BY p.city ORDER BY ns.total_live_nights DESC, ts.total_dates DESC) AS rank,
      ns.current_streak AS nights_live,
      ts.total_dates    AS matches_made,
      p.display_name,
      p.avatar_emoji
    FROM profiles p
    JOIN trust_scores ts ON ts.user_id = p.id
    JOIN night_streaks ns ON ns.user_id = p.id
    WHERE ns.current_streak > 0
    ON CONFLICT (city, week_start, rank) DO UPDATE
      SET nights_live  = EXCLUDED.nights_live,
          matches_made = EXCLUDED.matches_made
  `, [weekStr]);
  logger.info({ weekStart: weekStr }, 'city leaderboard refreshed');
}

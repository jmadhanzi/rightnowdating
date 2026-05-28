import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
const PERSONALITY_TYPES = [
  { key: 'night_owl',        label: 'Night Owl',         emoji: '🦉', threshold: (n: number) => n >= 5 },
  { key: 'weekend_warrior',  label: 'Weekend Warrior',   emoji: '⚡', threshold: (n: number) => n >= 3 },
  { key: 'spontaneous',      label: 'Spontaneous',       emoji: '🎲', threshold: (n: number) => n >= 2 },
  { key: 'social_butterfly', label: 'Social Butterfly',  emoji: '🦋', threshold: () => true },
] as const;

export interface WeeklyWrapped {
  weekStart: string;
  nightsLive: number;
  sparksSent: number;
  sparksReceived: number;
  matchesMade: number;
  datesConfirmed: number;
  avgMatchTimeMins: number | null;
  topVibe: string | null;
  headline: string;
  shareText: string;
}

export interface MonthlyWrapped {
  monthStart: string;
  nightsLive: number;
  sparksSent: number;
  sparksReceived: number;
  matchesMade: number;
  datesConfirmed: number;
  totalDistanceMiles: number;
  streakPeak: number;
  topVibe: string | null;
  personalityType: string;
  personalityEmoji: string;
  headline: string;
  subline: string;
  shareText: string;
  badgeLines: string[];
}

// ---------------------------------------------------------------------------
// Compute and cache a weekly wrapped for a user
// ---------------------------------------------------------------------------
export async function getWeeklyWrapped(userId: string, weekStart?: string): Promise<WeeklyWrapped> {
  const week = weekStart ?? getLastWeekStart();

  // Try cache first
  const cacheKey = `wrapped:weekly:${userId}:${week}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as WeeklyWrapped;

  const nextWeek = new Date(new Date(week).getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const [liveSessions, sparks, matches] = await Promise.all([
    pool.query<{ count: string; top_vibe: string | null }>(
      `SELECT COUNT(*)::text AS count,
              MODE() WITHIN GROUP (ORDER BY vibe) AS top_vibe
         FROM live_sessions
        WHERE user_id = $1
          AND created_at >= $2 AND created_at < $3`,
      [userId, week, nextWeek],
    ),
    pool.query<{ sent: string; received: string; avg_mins: number | null }>(
      `SELECT
         COUNT(*) FILTER (WHERE sender_id = $1)::text AS sent,
         COUNT(*) FILTER (WHERE receiver_id = $1)::text AS received,
         ROUND(AVG(EXTRACT(EPOCH FROM (m.created_at - s.created_at)) / 60)::numeric, 1)::float AS avg_mins
       FROM sparks s
       LEFT JOIN matches m ON m.id = (
         SELECT id FROM matches WHERE spark_id = s.id LIMIT 1
       )
       WHERE (s.sender_id = $1 OR s.receiver_id = $1)
         AND s.created_at >= $2 AND s.created_at < $3`,
      [userId, week, nextWeek],
    ),
    pool.query<{ made: string; confirmed: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('matched','confirmed'))::text AS made,
         COUNT(*) FILTER (WHERE status = 'confirmed')::text AS confirmed
       FROM matches
       WHERE (user1_id = $1 OR user2_id = $1)
         AND created_at >= $2 AND created_at < $3`,
      [userId, week, nextWeek],
    ),
  ]);

  const nightsLive      = Number(liveSessions.rows[0]?.count ?? 0);
  const sparksSent      = Number(sparks.rows[0]?.sent ?? 0);
  const sparksReceived  = Number(sparks.rows[0]?.received ?? 0);
  const matchesMade     = Number(matches.rows[0]?.made ?? 0);
  const datesConfirmed  = Number(matches.rows[0]?.confirmed ?? 0);
  const topVibe         = liveSessions.rows[0]?.top_vibe ?? null;
  const avgMatchTimeMins = sparks.rows[0]?.avg_mins ?? null;

  const headline = buildWeeklyHeadline({ nightsLive, matchesMade, sparksSent, sparksReceived });
  const shareText = buildWeeklyShareText({ nightsLive, matchesMade, sparksSent, sparksReceived, datesConfirmed });

  const result: WeeklyWrapped = {
    weekStart: week, nightsLive, sparksSent, sparksReceived, matchesMade,
    datesConfirmed, avgMatchTimeMins, topVibe, headline, shareText,
  };

  // Cache for 6 hours
  await redis.set(cacheKey, JSON.stringify(result), 'EX', 6 * 3600).catch(() => undefined);
  return result;
}

// ---------------------------------------------------------------------------
// Compute monthly wrapped
// ---------------------------------------------------------------------------
export async function getMonthlyWrapped(userId: string, monthStart?: string): Promise<MonthlyWrapped> {
  const month = monthStart ?? getLastMonthStart();
  const cacheKey = `wrapped:monthly:${userId}:${month}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as MonthlyWrapped;

  const nextMonth = new Date(new Date(month).setUTCMonth(new Date(month).getUTCMonth() + 1))
    .toISOString().slice(0, 10);

  const [liveSessions, sparks, matches, streak] = await Promise.all([
    pool.query<{ count: string; top_vibe: string | null }>(
      `SELECT COUNT(*)::text AS count, MODE() WITHIN GROUP (ORDER BY vibe) AS top_vibe
         FROM live_sessions
        WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
      [userId, month, nextMonth],
    ),
    pool.query<{ sent: string; received: string }>(
      `SELECT COUNT(*) FILTER (WHERE sender_id=$1)::text AS sent,
              COUNT(*) FILTER (WHERE receiver_id=$1)::text AS received
         FROM sparks WHERE (sender_id=$1 OR receiver_id=$1) AND created_at>=$2 AND created_at<$3`,
      [userId, month, nextMonth],
    ),
    pool.query<{ made: string; confirmed: string }>(
      `SELECT COUNT(*) FILTER (WHERE status IN ('matched','confirmed'))::text AS made,
              COUNT(*) FILTER (WHERE status='confirmed')::text AS confirmed
         FROM matches WHERE (user1_id=$1 OR user2_id=$1) AND created_at>=$2 AND created_at<$3`,
      [userId, month, nextMonth],
    ),
    pool.query<{ longest_streak: number }>(
      'SELECT longest_streak FROM night_streaks WHERE user_id = $1',
      [userId],
    ),
  ]);

  const nightsLive       = Number(liveSessions.rows[0]?.count ?? 0);
  const sparksSent       = Number(sparks.rows[0]?.sent ?? 0);
  const sparksReceived   = Number(sparks.rows[0]?.received ?? 0);
  const matchesMade      = Number(matches.rows[0]?.made ?? 0);
  const datesConfirmed   = Number(matches.rows[0]?.confirmed ?? 0);
  const topVibe          = liveSessions.rows[0]?.top_vibe ?? null;
  const streakPeak       = streak.rows[0]?.longest_streak ?? 0;
  const totalDistanceMiles = datesConfirmed * 1.2; // rough average

  const personality = PERSONALITY_TYPES.find((p) => p.threshold(nightsLive)) ?? PERSONALITY_TYPES[3]!;
  const headline = buildMonthlyHeadline({ nightsLive, matchesMade, datesConfirmed, streakPeak });
  const subline  = buildMonthlySubline({ sparksSent, sparksReceived, personality: personality.label });
  const shareText = buildMonthlyShareText({ nightsLive, matchesMade, datesConfirmed, personality: personality.label });
  const badgeLines = buildBadgeLines({ nightsLive, matchesMade, datesConfirmed, sparksSent, sparksReceived, streakPeak });

  const result: MonthlyWrapped = {
    monthStart: month, nightsLive, sparksSent, sparksReceived, matchesMade,
    datesConfirmed, totalDistanceMiles, streakPeak, topVibe,
    personalityType: personality.label,
    personalityEmoji: personality.emoji,
    headline, subline, shareText, badgeLines,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 12 * 3600).catch(() => undefined);
  return result;
}

// ---------------------------------------------------------------------------
// Batch refresh — called by weekly cron
// ---------------------------------------------------------------------------
export async function refreshWeeklyStats(weekStart: string): Promise<void> {
  const { rows: users } = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM live_sessions
      WHERE created_at >= $1 AND created_at < ($1::date + INTERVAL '7 days')`,
    [weekStart],
  );
  logger.info({ count: users.length, weekStart }, 'refreshing weekly wrapped stats');
  // Invalidate caches — they'll recompute on next request
  for (const { user_id } of users) {
    await redis.del(`wrapped:weekly:${user_id}:${weekStart}`).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Copy writing helpers — headlines that feel human not algorithmic
// ---------------------------------------------------------------------------
function buildWeeklyHeadline(s: { nightsLive: number; matchesMade: number; sparksSent: number; sparksReceived: number }): string {
  if (s.nightsLive === 0) return "You had a quiet week. The city missed you.";
  if (s.matchesMade >= 3) return `${s.matchesMade} matches in one week. You're on fire. 🔥`;
  if (s.sparksSent > s.sparksReceived * 2) return "You've been sparking hard. Someone's about to notice.";
  if (s.sparksReceived > s.sparksSent * 2) return "People are sparking you more than you know it.";
  if (s.nightsLive >= 4) return "You were the city this week.";
  if (s.nightsLive >= 2) return "Two nights out. That's how it starts.";
  return "One night live is all it takes.";
}

function buildWeeklyShareText(s: { nightsLive: number; matchesMade: number; sparksSent: number; sparksReceived: number; datesConfirmed: number }): string {
  const lines: string[] = [
    `⚡ My week on RIGHTNOW:`,
    `🌙 ${s.nightsLive} night${s.nightsLive !== 1 ? 's' : ''} live`,
    `✨ ${s.sparksSent} sparks sent · ${s.sparksReceived} received`,
    `🎯 ${s.matchesMade} match${s.matchesMade !== 1 ? 'es' : ''}`,
  ];
  if (s.datesConfirmed > 0) lines.push(`📍 ${s.datesConfirmed} date${s.datesConfirmed !== 1 ? 's' : ''} confirmed`);
  lines.push(`rightnow.app`);
  return lines.join('\n');
}

function buildMonthlyHeadline(s: { nightsLive: number; matchesMade: number; datesConfirmed: number; streakPeak: number }): string {
  if (s.datesConfirmed >= 3) return "You lived it this month. Real dates, real stories.";
  if (s.streakPeak >= 7)     return "A week-long streak. You owned your city.";
  if (s.matchesMade >= 5)    return `${s.matchesMade} matches. You've been busy in all the right ways.`;
  if (s.nightsLive >= 8)     return "Eight nights out. You ARE the nightlife.";
  if (s.nightsLive >= 4)     return "Half the month, you were out there meeting people.";
  if (s.nightsLive >= 2)     return "A few nights out. The foundation of something good.";
  return "The city was calling. You're figuring it out.";
}

function buildMonthlySubline(s: { sparksSent: number; sparksReceived: number; personality: string }): string {
  const ratio = s.sparksSent > 0 ? (s.sparksReceived / s.sparksSent).toFixed(1) : '—';
  return `${s.sparksSent} sparks sent · ${s.sparksReceived} received (${ratio}× return rate) · Personality: ${s.personality}`;
}

function buildMonthlyShareText(s: { nightsLive: number; matchesMade: number; datesConfirmed: number; personality: string }): string {
  return [
    `📅 My RIGHTNOW month:`,
    `🌙 ${s.nightsLive} nights live`,
    `🎯 ${s.matchesMade} matches`,
    s.datesConfirmed > 0 ? `📍 ${s.datesConfirmed} actual dates` : null,
    `✨ Personality: ${s.personality}`,
    `rightnow.app`,
  ].filter(Boolean).join('\n');
}

function buildBadgeLines(s: {
  nightsLive: number; matchesMade: number; datesConfirmed: number;
  sparksSent: number; sparksReceived: number; streakPeak: number;
}): string[] {
  const badges: string[] = [];
  if (s.nightsLive >= 8)     badges.push('🌙 Night Nomad — 8+ nights live');
  if (s.matchesMade >= 5)    badges.push('⚡ Spark Magnet — 5+ matches');
  if (s.datesConfirmed >= 3) badges.push('📍 Date Maker — 3+ dates confirmed');
  if (s.streakPeak >= 7)     badges.push('🔥 Week Streak — 7+ nights in a row');
  if (s.sparksReceived > s.sparksSent) badges.push('💫 Highly Sought — received more sparks than sent');
  if (badges.length === 0)   badges.push('🌱 Just Getting Started — keep going!');
  return badges;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getLastWeekStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7 - d.getUTCDay()); // last Sunday
  return d.toISOString().slice(0, 10);
}

function getLastMonthStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

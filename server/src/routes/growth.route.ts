import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth.js';
import { getWeeklyWrapped, getMonthlyWrapped } from '../services/wrapped.service.js';
import { getStreakInfo } from '../services/streak.service.js';
import { computeProfileCompletion } from '../services/profileCompletion.service.js';
import { pool } from '../db/index.js';

const authOpts = { preHandler: authenticateToken };
const wrappedQuery = z.object({ weekStart: z.string().optional(), monthStart: z.string().optional() });

export async function growthRoutes(app: FastifyInstance): Promise<void> {
  // ── Wrapped / Recap ──────────────────────────────────────────────────────
  app.get('/wrapped/weekly', authOpts, async (req, reply) => {
    const { weekStart } = wrappedQuery.parse(req.query);
    return reply.send(await getWeeklyWrapped(req.user.userId, weekStart));
  });

  app.get('/wrapped/monthly', authOpts, async (req, reply) => {
    const { monthStart } = wrappedQuery.parse(req.query);
    return reply.send(await getMonthlyWrapped(req.user.userId, monthStart));
  });

  // ── Night Streaks ────────────────────────────────────────────────────────
  app.get('/streak/me', authOpts, async (req, reply) => {
    return reply.send(await getStreakInfo(req.user.userId));
  });

  // ── Profile Completion Score ─────────────────────────────────────────────
  app.get('/profile/completion', authOpts, async (req, reply) => {
    return reply.send(await computeProfileCompletion(req.user.userId));
  });

  // ── City Leaderboard ─────────────────────────────────────────────────────
  app.get('/leaderboard/:city', authOpts, async (req, reply) => {
    const { city } = z.object({ city: z.string().min(1).max(50) }).parse(req.params);

    const { rows } = await pool.query<{
      rank: number;
      display_name: string;
      avatar_emoji: string;
      nights_live: number;
      matches_made: number;
      user_id: string;
    }>(
      `SELECT rank, display_name, avatar_emoji, nights_live, matches_made, user_id
         FROM city_leaderboard_weekly
        WHERE city = $1
          AND week_start = (
            SELECT MAX(week_start) FROM city_leaderboard_weekly WHERE city = $1
          )
        ORDER BY rank ASC
        LIMIT 20`,
      [city],
    );
    return reply.send({ leaderboard: rows, city });
  });

  // ── Notification Preferences ─────────────────────────────────────────────
  app.get('/notification-prefs', authOpts, async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1',
      [req.user.userId],
    );
    // Return defaults if not set
    return reply.send(rows[0] ?? {
      peak_hour_alerts: true, streak_reminders: true, weekly_wrapped: true,
      idle_match_nudge: true, city_heating_up: true, preferred_alert_hour: 19,
    });
  });

  app.put('/notification-prefs', authOpts, async (req, reply) => {
    const body = z.object({
      peak_hour_alerts:    z.boolean().optional(),
      streak_reminders:    z.boolean().optional(),
      weekly_wrapped:      z.boolean().optional(),
      idle_match_nudge:    z.boolean().optional(),
      city_heating_up:     z.boolean().optional(),
      preferred_alert_hour: z.number().int().min(0).max(23).optional(),
    }).parse(req.body);

    await pool.query(
      `INSERT INTO notification_preferences (user_id, peak_hour_alerts, streak_reminders,
         weekly_wrapped, idle_match_nudge, city_heating_up, preferred_alert_hour)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         peak_hour_alerts    = COALESCE($2, notification_preferences.peak_hour_alerts),
         streak_reminders    = COALESCE($3, notification_preferences.streak_reminders),
         weekly_wrapped      = COALESCE($4, notification_preferences.weekly_wrapped),
         idle_match_nudge    = COALESCE($5, notification_preferences.idle_match_nudge),
         city_heating_up     = COALESCE($6, notification_preferences.city_heating_up),
         preferred_alert_hour = COALESCE($7, notification_preferences.preferred_alert_hour)`,
      [
        req.user.userId,
        body.peak_hour_alerts, body.streak_reminders, body.weekly_wrapped,
        body.idle_match_nudge, body.city_heating_up, body.preferred_alert_hour,
      ],
    );
    return reply.send({ updated: true });
  });
}

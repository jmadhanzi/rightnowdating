import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logger } from '../utils/logger.js';
import { pool, transaction } from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';
import { badRequest, forbidden, notFound } from '../utils/http-error.js';
import { sendSms } from '../services/twilio.service.js';
import { recalculateTrustScore } from '../services/trustScore.service.js';

const sosBody = z.object({
  matchId: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
});

const trustedContactsBody = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().min(1),
        phone: z.string().min(1),
        isPrimary: z.boolean().optional(),
      }),
    )
    .max(3, 'A maximum of 3 trusted contacts is allowed.'),
});

const reportBody = z.object({
  reportedUserId: z.string().uuid(),
  matchId: z.string().uuid().optional(),
  reason: z.enum([
    'harassment',
    'no_show',
    'fake_profile',
    'inappropriate',
    'felt_unsafe',
    'other',
  ]),
  description: z.string().optional(),
});

const REPORT_SUSPEND_THRESHOLD = 3;

export async function safetyRoutes(app: FastifyInstance): Promise<void> {
  // Emergency SOS — the only endpoint that stores exact GPS.
  app.post('/safety/sos', { preHandler: authenticateToken }, async (request, reply) => {
    const { matchId, latitude, longitude } = sosBody.parse(request.body);
    const { userId } = request.user;

    const matchRes = await pool.query<{
      user1_id: string;
      user2_id: string;
      venue_id: string | null;
      status: string;
    }>('SELECT user1_id, user2_id, venue_id, status FROM matches WHERE id = $1', [matchId]);
    const match = matchRes.rows[0];
    if (!match) throw notFound('Match not found.');
    if (userId !== match.user1_id && userId !== match.user2_id) {
      throw forbidden('You are not part of this match.');
    }
    if (match.status === 'cancelled' || match.status === 'expired') {
      throw badRequest('This match is no longer active.');
    }

    // Store exact GPS (only here) and mark it as escalated.
    await pool.query(
      `INSERT INTO sos_events (user_id, match_id, location, escalated_to_emergency)
       VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), true)`,
      [userId, matchId, longitude, latitude],
    );

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

    const nameRes = await pool.query<{ display_name: string }>(
      'SELECT display_name FROM profiles WHERE id = $1',
      [userId],
    );
    const name = nameRes.rows[0]?.display_name ?? 'Someone';

    const contactsRes = await pool.query<{ contact_name: string; contact_phone: string }>(
      'SELECT contact_name, contact_phone FROM trusted_contacts WHERE user_id = $1',
      [userId],
    );

    const contacted: string[] = [];
    for (const c of contactsRes.rows) {
      const body =
        `URGENT: ${name} triggered an emergency on RIGHTNOW. They were at ` +
        `${venueName}, ${venueAddress}. Please check on them immediately.`;
      try {
        await sendSms(c.contact_phone, body);
        contacted.push(c.contact_name);
      } catch (err) {
        logger.error({ err }, 'failed to send SOS SMS to trusted contact');
      }
    }

    // Flag the matched user for immediate review.
    const otherUserId = userId === match.user1_id ? match.user2_id : match.user1_id;
    await pool.query('UPDATE users SET flagged_for_review = true WHERE id = $1', [otherUserId]);

    return reply.send({ contacted, success: true });
  });

  // Replace the user's trusted contacts (max 3).
  app.post(
    '/safety/trusted-contacts',
    { preHandler: authenticateToken },
    async (request, reply) => {
      const { contacts } = trustedContactsBody.parse(request.body);
      const { userId } = request.user;

      const saved = await transaction(async (client) => {
        await client.query('DELETE FROM trusted_contacts WHERE user_id = $1', [userId]);
        const out: { id: string; name: string; phone: string; isPrimary: boolean }[] = [];
        for (const c of contacts) {
          const res = await client.query<{
            id: string;
            contact_name: string;
            contact_phone: string;
            is_primary: boolean;
          }>(
            `INSERT INTO trusted_contacts (user_id, contact_name, contact_phone, is_primary)
           VALUES ($1, $2, $3, $4)
           RETURNING id, contact_name, contact_phone, is_primary`,
            [userId, c.name, c.phone, c.isPrimary ?? false],
          );
          const row = res.rows[0]!;
          out.push({
            id: row.id,
            name: row.contact_name,
            phone: row.contact_phone,
            isPrimary: row.is_primary,
          });
        }
        return out;
      });

      return reply.send({ success: true, contacts: saved });
    },
  );

  // Report another user.
  app.post('/safety/report', { preHandler: authenticateToken }, async (request, reply) => {
    const { reportedUserId, matchId, reason, description } = reportBody.parse(request.body);
    const reporterId = request.user.userId;
    if (reportedUserId === reporterId) throw badRequest('You cannot report yourself.');

    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO reports (reporter_id, reported_user_id, match_id, reason, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [reporterId, reportedUserId, matchId ?? null, reason, description ?? null],
    );
    const reportId = inserted.rows[0]!.id;

    await recalculateTrustScore(reportedUserId);

    const recent = await pool.query<{ c: number }>(
      "SELECT COUNT(*)::int AS c FROM reports WHERE reported_user_id = $1 AND created_at > NOW() - INTERVAL '7 days'",
      [reportedUserId],
    );
    if ((recent.rows[0]?.c ?? 0) >= REPORT_SUSPEND_THRESHOLD) {
      await pool.query(
        'UPDATE users SET is_suspended = true, flagged_for_review = true, suspended_at = NOW() WHERE id = $1',
        [reportedUserId],
      );
      logger.warn({ reportedUserId }, 'user auto-suspended after repeated reports');
    }

    return reply.send({ success: true, reportId });
  });
}

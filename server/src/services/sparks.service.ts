import { pool } from '../db/index.js';
import { badRequest } from '../utils/http-error.js';

export const SPARK_TTL_SECONDS = 7 * 60;

export interface CreateSparkParams {
  senderId: string;
  receiverId: string;
  senderSessionId: string;
  receiverSessionId: string;
}

/**
 * Create (or refresh) a pending spark with a 7-minute window. The unique
 * (sender, receiver, sender_session) constraint dedupes repeat sparks in the
 * same session — they update the existing row rather than create a duplicate.
 */
export async function createSpark(
  params: CreateSparkParams,
): Promise<{ sparkId: string; expiresAt: Date }> {
  if (params.senderId === params.receiverId) {
    throw badRequest('You cannot spark yourself.');
  }
  const expiresAt = new Date(Date.now() + SPARK_TTL_SECONDS * 1000);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sparks (sender_id, receiver_id, sender_session_id, receiver_session_id, status, expires_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     ON CONFLICT (sender_id, receiver_id, sender_session_id)
       DO UPDATE SET expires_at = EXCLUDED.expires_at, status = 'pending'
     RETURNING id`,
    [
      params.senderId,
      params.receiverId,
      params.senderSessionId,
      params.receiverSessionId,
      expiresAt,
    ],
  );
  return { sparkId: rows[0]!.id, expiresAt };
}

/** Mark a pending spark mutual (only the receiver can accept). */
export async function acceptSpark(
  sparkId: string,
  receiverId: string,
): Promise<{
  senderId: string;
  senderSessionId: string | null;
  receiverSessionId: string | null;
} | null> {
  const { rows } = await pool.query<{
    sender_id: string;
    sender_session_id: string | null;
    receiver_session_id: string | null;
  }>(
    `UPDATE sparks SET status = 'mutual'
      WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
      RETURNING sender_id, sender_session_id, receiver_session_id`,
    [sparkId, receiverId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    senderId: row.sender_id,
    senderSessionId: row.sender_session_id,
    receiverSessionId: row.receiver_session_id,
  };
}

/** Decline a pending spark. */
export async function declineSpark(sparkId: string, receiverId: string): Promise<void> {
  await pool.query(
    "UPDATE sparks SET status = 'declined' WHERE id = $1 AND receiver_id = $2 AND status = 'pending'",
    [sparkId, receiverId],
  );
}

/** Create a match record from an accepted spark. */
export async function createMatch(params: {
  sparkId: string;
  user1Id: string;
  user2Id: string;
  venueId: string | null;
  meetupTime: Date;
}): Promise<{ matchId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO matches (spark_id, user1_id, user2_id, venue_id, meetup_time, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id`,
    [params.sparkId, params.user1Id, params.user2Id, params.venueId, params.meetupTime],
  );
  return { matchId: rows[0]!.id };
}

/** Expire a still-pending spark; returns the two users to notify (or null). */
export async function expireSpark(
  sparkId: string,
): Promise<{ senderId: string; receiverId: string } | null> {
  const { rows } = await pool.query<{ sender_id: string; receiver_id: string }>(
    "UPDATE sparks SET status = 'expired' WHERE id = $1 AND status = 'pending' RETURNING sender_id, receiver_id",
    [sparkId],
  );
  const row = rows[0];
  return row ? { senderId: row.sender_id, receiverId: row.receiver_id } : null;
}

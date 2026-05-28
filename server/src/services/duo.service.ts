import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { badRequest, notFound, forbidden } from '../utils/http-error.js';
import { sendToUser } from './notifications.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type OpennessLevel = 'solo' | 'duo_friendly' | 'group' | 'open_night';
export const DUO_SPARK_TTL = 7 * 60; // 7 minutes — same as regular sparks

export interface DuoProfile {
  duoId: string;
  status: 'pending' | 'active' | 'ended';
  partner: {
    id: string;
    displayName: string;
    age: number;
    avatarEmoji: string;
    trustScore: number;
  };
  createdAt: string;
}

export interface OpenNight {
  id: string;
  hostUserId: string;
  hostDisplayName: string;
  hostAvatarEmoji: string;
  duoId: string | null;
  partnerDisplayName: string | null;
  venueName: string;
  headline: string;
  vibe: string;
  capacity: number;
  spotsTaken: number;
  spotsLeft: number;
  latitude: number | null;
  longitude: number | null;
  expiresAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// DUO MANAGEMENT
// ---------------------------------------------------------------------------

/** Send a duo invite. One active duo per user at a time. */
export async function inviteDuo(inviterId: string, partnerId: string): Promise<{ duoId: string }> {
  if (inviterId === partnerId) throw badRequest('You cannot duo with yourself.');

  // Check partner exists and is not already in an active duo
  const partnerCheck = await pool.query<{
    display_name: string;
    has_active_duo: boolean;
  }>(
    `SELECT p.display_name,
            EXISTS(
              SELECT 1 FROM duos d
              WHERE d.status = 'active'
                AND (d.inviter_id = u.id OR d.partner_id = u.id)
            ) AS has_active_duo
       FROM users u
       JOIN profiles p ON p.id = u.id
      WHERE u.id = $1`,
    [partnerId],
  );
  if (!partnerCheck.rows[0]) throw notFound('User not found.');
  if (partnerCheck.rows[0].has_active_duo) {
    throw badRequest(`${partnerCheck.rows[0].display_name} is already in an active duo.`);
  }

  // Upsert duo (re-invite resets to pending)
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO duos (inviter_id, partner_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (LEAST(inviter_id,$1), GREATEST(inviter_id,$1))
       DO UPDATE SET status = 'pending', updated_at = NOW()
       WHERE duos.status != 'active'
     RETURNING id`,
    [inviterId, partnerId],
  );
  if (!rows[0]) throw badRequest('You already have an active duo with this person.');

  const duoId = rows[0].id;

  // Notify partner
  const inviter = await pool.query<{ display_name: string; avatar_emoji: string }>(
    'SELECT display_name, avatar_emoji FROM profiles WHERE id = $1',
    [inviterId],
  );
  const inv = inviter.rows[0];
  await sendToUser(partnerId, {
    title: '🤝 Duo invite!',
    body: `${inv?.avatar_emoji ?? '⚡'} ${inv?.display_name ?? 'Someone'} wants to team up and double date tonight.`,
    data: { type: 'duo_invite', duoId },
    ttl: 3600,
  });

  logger.info({ inviterId, partnerId, duoId }, 'duo invite sent');
  return { duoId };
}

/** Accept a pending duo invite. */
export async function acceptDuo(duoId: string, userId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE duos SET status = 'active', updated_at = NOW()
      WHERE id = $1 AND partner_id = $2 AND status = 'pending'`,
    [duoId, userId],
  );
  if (!rowCount) throw notFound('Duo invite not found or already actioned.');

  // Notify inviter
  const row = await pool.query<{
    inviter_id: string;
    partner_name: string;
    partner_emoji: string;
  }>(
    `SELECT d.inviter_id, p.display_name AS partner_name, p.avatar_emoji AS partner_emoji
       FROM duos d JOIN profiles p ON p.id = d.partner_id
      WHERE d.id = $1`,
    [duoId],
  );
  const r = row.rows[0];
  if (r) {
    await sendToUser(r.inviter_id, {
      title: '🎉 Duo accepted!',
      body: `${r.partner_emoji} ${r.partner_name} joined your duo. Time to find your double date!`,
      data: { type: 'duo_accepted', duoId },
      ttl: 3600,
    });
  }
}

/** End (dissolve) an active duo — either member can end it. */
export async function endDuo(duoId: string, userId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE duos SET status = 'ended', updated_at = NOW()
      WHERE id = $1 AND (inviter_id = $2 OR partner_id = $2) AND status = 'active'`,
    [duoId, userId],
  );
  if (!rowCount) throw notFound('Active duo not found.');
}

/** Get the requesting user's current active or pending duo. */
export async function getMyDuo(userId: string): Promise<DuoProfile | null> {
  const { rows } = await pool.query<{
    duo_id: string;
    status: 'pending' | 'active' | 'ended';
    partner_id: string;
    display_name: string;
    age: number;
    avatar_emoji: string;
    trust_score: number;
    created_at: string;
  }>(
    `SELECT d.id AS duo_id, d.status, d.created_at,
            p.id AS partner_id, p.display_name, p.age, p.avatar_emoji, p.trust_score
       FROM duos d
       JOIN profiles p ON p.id = CASE
         WHEN d.inviter_id = $1 THEN d.partner_id
         ELSE d.inviter_id
       END
      WHERE (d.inviter_id = $1 OR d.partner_id = $1)
        AND d.status IN ('pending', 'active')
      ORDER BY d.updated_at DESC
      LIMIT 1`,
    [userId],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    duoId: r.duo_id,
    status: r.status,
    partner: {
      id: r.partner_id,
      displayName: r.display_name,
      age: r.age,
      avatarEmoji: r.avatar_emoji,
      trustScore: r.trust_score,
    },
    createdAt: r.created_at,
  };
}

/** Look up a user by phone or display name to invite them. */
export async function searchUsersForDuo(
  query: string,
  requesterId: string,
): Promise<Array<{ id: string; displayName: string; age: number; avatarEmoji: string }>> {
  const { rows } = await pool.query<{
    id: string;
    display_name: string;
    age: number;
    avatar_emoji: string;
  }>(
    `SELECT p.id, p.display_name, p.age, p.avatar_emoji
       FROM profiles p
       JOIN users u ON u.id = p.id
      WHERE p.id != $2
        AND (
          LOWER(p.display_name) LIKE LOWER($1)
          OR u.phone LIKE $1
        )
        AND NOT EXISTS (
          SELECT 1 FROM duos d
          WHERE d.status = 'active'
            AND (d.inviter_id = p.id OR d.partner_id = p.id)
        )
      LIMIT 8`,
    [`%${query}%`, requesterId],
  );
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    age: r.age,
    avatarEmoji: r.avatar_emoji,
  }));
}

// ---------------------------------------------------------------------------
// OPEN NIGHTS
// ---------------------------------------------------------------------------

/** Create an Open Night — broadcast your table to the city. */
export async function createOpenNight(params: {
  hostUserId: string;
  duoId: string | null;
  venueName: string;
  venueId?: string;
  headline: string;
  vibe: string;
  capacity: number;
  latitude?: number;
  longitude?: number;
  durationMinutes?: number;
}): Promise<{ openNightId: string }> {
  const expiresAt = new Date(Date.now() + (params.durationMinutes ?? 120) * 60 * 1000);

  // If duoId provided, verify user is a member
  if (params.duoId) {
    const check = await pool.query(
      `SELECT 1 FROM duos WHERE id = $1 AND status = 'active'
         AND (inviter_id = $2 OR partner_id = $2)`,
      [params.duoId, params.hostUserId],
    );
    if (!check.rowCount) throw forbidden('You are not in this duo.');
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO open_nights
       (host_user_id, duo_id, venue_name, venue_id, headline, vibe, capacity, latitude, longitude, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      params.hostUserId,
      params.duoId ?? null,
      params.venueName.trim().slice(0, 120),
      params.venueId ?? null,
      params.headline.trim().slice(0, 100),
      params.vibe,
      params.capacity,
      params.latitude ?? null,
      params.longitude ?? null,
      expiresAt,
    ],
  );
  logger.info({ openNightId: rows[0]!.id, hostUserId: params.hostUserId }, 'open night created');
  return { openNightId: rows[0]!.id };
}

/** List active Open Nights near a location. */
export async function getNearbyOpenNights(params: {
  latitude: number;
  longitude: number;
  radiusMiles?: number;
  limit?: number;
}): Promise<OpenNight[]> {
  const radius = (params.radiusMiles ?? 5) * 1609.34;
  const { rows } = await pool.query<{
    id: string;
    host_user_id: string;
    host_display_name: string;
    host_avatar_emoji: string;
    duo_id: string | null;
    partner_display_name: string | null;
    venue_name: string;
    headline: string;
    vibe: string;
    capacity: number;
    spots_taken: number;
    latitude: number | null;
    longitude: number | null;
    expires_at: string;
    created_at: string;
  }>(
    `SELECT on2.id, on2.host_user_id, p_host.display_name AS host_display_name,
            p_host.avatar_emoji AS host_avatar_emoji, on2.duo_id,
            p_partner.display_name AS partner_display_name,
            on2.venue_name, on2.headline, on2.vibe, on2.capacity, on2.spots_taken,
            ST_Y(on2.latitude::geometry) AS latitude,
            ST_X(on2.longitude::geometry) AS longitude,
            on2.expires_at, on2.created_at
       FROM open_nights on2
       JOIN profiles p_host ON p_host.id = on2.host_user_id
       LEFT JOIN duos d ON d.id = on2.duo_id
       LEFT JOIN profiles p_partner ON p_partner.id = CASE
         WHEN d.inviter_id = on2.host_user_id THEN d.partner_id
         ELSE d.inviter_id
       END
      WHERE on2.is_active = true
        AND on2.expires_at > NOW()
        AND on2.spots_taken < on2.capacity
        AND ($3::float IS NULL OR ST_DWithin(
              ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
              ST_SetSRID(ST_MakePoint(on2.longitude, on2.latitude), 4326)::geography,
              $3
            ))
      ORDER BY on2.created_at DESC
      LIMIT $4`,
    [params.latitude, params.longitude, radius, params.limit ?? 20],
  );
  return rows.map((r) => ({
    id: r.id,
    hostUserId: r.host_user_id,
    hostDisplayName: r.host_display_name,
    hostAvatarEmoji: r.host_avatar_emoji,
    duoId: r.duo_id,
    partnerDisplayName: r.partner_display_name,
    venueName: r.venue_name,
    headline: r.headline,
    vibe: r.vibe,
    capacity: r.capacity,
    spotsTaken: r.spots_taken,
    spotsLeft: r.capacity - r.spots_taken,
    latitude: r.latitude,
    longitude: r.longitude,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}

/** Request to join an Open Night. */
export async function requestJoinOpenNight(params: {
  openNightId: string;
  requesterId: string;
  duoId?: string;
  message?: string;
}): Promise<{ requestId: string }> {
  // Check open night is still open
  const night = await pool.query<{
    host_user_id: string;
    capacity: number;
    spots_taken: number;
    headline: string;
    venue_name: string;
  }>(
    'SELECT host_user_id, capacity, spots_taken, headline, venue_name FROM open_nights WHERE id = $1 AND is_active = true AND expires_at > NOW()',
    [params.openNightId],
  );
  if (!night.rows[0]) throw notFound('This open night is no longer available.');
  const n = night.rows[0];
  if (n.spots_taken >= n.capacity) throw badRequest('No spots left at this table.');
  if (n.host_user_id === params.requesterId) throw badRequest("You can't request to join your own open night.");

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO open_night_requests (open_night_id, requester_id, duo_id, message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (open_night_id, requester_id) DO UPDATE
       SET message = EXCLUDED.message, status = 'pending'
     RETURNING id`,
    [params.openNightId, params.requesterId, params.duoId ?? null, params.message?.trim().slice(0, 200) ?? null],
  );

  // Get requester profile for notification
  const requester = await pool.query<{ display_name: string; avatar_emoji: string }>(
    'SELECT display_name, avatar_emoji FROM profiles WHERE id = $1',
    [params.requesterId],
  );
  const req = requester.rows[0];

  // Notify the host
  await sendToUser(n.host_user_id, {
    title: '🙋 Someone wants to join!',
    body: `${req?.avatar_emoji ?? '👋'} ${req?.display_name ?? 'Someone'} wants to join your table at ${n.venue_name}`,
    data: { type: 'open_night_request', openNightId: params.openNightId, requestId: rows[0]!.id },
    ttl: 1800,
  });

  return { requestId: rows[0]!.id };
}

/** Host accepts/declines a join request. */
export async function respondToJoinRequest(params: {
  requestId: string;
  hostUserId: string;
  accept: boolean;
}): Promise<void> {
  // Verify host owns the open night
  const req = await pool.query<{
    open_night_id: string;
    requester_id: string;
    duo_id: string | null;
    status: string;
    venue_name: string;
    capacity: number;
    spots_taken: number;
  }>(
    `SELECT onr.open_night_id, onr.requester_id, onr.duo_id, onr.status,
            on2.venue_name, on2.capacity, on2.spots_taken
       FROM open_night_requests onr
       JOIN open_nights on2 ON on2.id = onr.open_night_id
      WHERE onr.id = $1 AND on2.host_user_id = $2`,
    [params.requestId, params.hostUserId],
  );
  if (!req.rows[0]) throw notFound('Request not found.');
  const r = req.rows[0];
  if (r.status !== 'pending') throw badRequest('This request has already been actioned.');

  const newStatus = params.accept ? 'accepted' : 'declined';
  await pool.query(
    'UPDATE open_night_requests SET status = $1 WHERE id = $2',
    [newStatus, params.requestId],
  );

  if (params.accept) {
    // Increment spots_taken
    await pool.query(
      'UPDATE open_nights SET spots_taken = spots_taken + 1 WHERE id = $1',
      [r.open_night_id],
    );
  }

  // Notify requester
  const host = await pool.query<{ display_name: string; avatar_emoji: string }>(
    'SELECT display_name, avatar_emoji FROM profiles WHERE id = $1',
    [params.hostUserId],
  );
  const h = host.rows[0];
  await sendToUser(r.requester_id, {
    title: params.accept ? '🎉 You're in!' : '😔 Not this time',
    body: params.accept
      ? `${h?.avatar_emoji ?? '🍸'} ${h?.display_name ?? 'Your host'} accepted you at ${r.venue_name}! Head over now.`
      : `${h?.display_name ?? 'The host'} couldn't fit you this time. Try another open night!`,
    data: { type: params.accept ? 'join_accepted' : 'join_declined', openNightId: r.open_night_id },
    ttl: 3600,
  });
}

// ---------------------------------------------------------------------------
// DUO SPARKS — cross-pair matching logic
// ---------------------------------------------------------------------------

/**
 * Fire a duo spark. Both duo members must spark the target before it goes mutual.
 * Works for duo→duo or duo→solo.
 */
export async function fireDuoSpark(params: {
  fromDuoId: string;
  sparkingUserId: string;
  toDuoId?: string;
  toUserId?: string;
}): Promise<{ duoSparkId: string; isMutual: boolean; bothMembersSparked: boolean }> {
  const { fromDuoId, sparkingUserId, toDuoId, toUserId } = params;
  if (!toDuoId && !toUserId) throw badRequest('Must target a duo or user.');
  if (toDuoId === fromDuoId) throw badRequest('Cannot spark your own duo.');

  const expiresAt = new Date(Date.now() + DUO_SPARK_TTL * 1000);

  // Find or create the duo spark record
  let sparkId: string;
  let member1Sparked = false;
  let member2Sparked = false;

  // Determine if sparkingUser is member1 or member2
  const duoMembers = await pool.query<{ inviter_id: string; partner_id: string }>(
    'SELECT inviter_id, partner_id FROM duos WHERE id = $1 AND status = $2',
    [fromDuoId, 'active'],
  );
  if (!duoMembers.rows[0]) throw badRequest('Your duo is not active.');
  const { inviter_id, partner_id } = duoMembers.rows[0];
  const isInviter = sparkingUserId === inviter_id;

  // Upsert duo_spark
  const { rows } = await pool.query<{
    id: string;
    member1_sparked: boolean;
    member2_sparked: boolean;
    status: string;
  }>(
    `INSERT INTO duo_sparks (from_duo_id, to_duo_id, to_user_id,
                             member1_sparked, member2_sparked, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     ON CONFLICT DO NOTHING
     RETURNING id, member1_sparked, member2_sparked, status`,
    [
      fromDuoId,
      toDuoId ?? null,
      toUserId ?? null,
      isInviter,
      !isInviter,
      expiresAt,
    ],
  );

  if (rows[0]) {
    sparkId = rows[0].id;
    member1Sparked = rows[0].member1_sparked;
    member2Sparked = rows[0].member2_sparked;
  } else {
    // Spark already exists — add this member's vote
    const field = isInviter ? 'member1_sparked' : 'member2_sparked';
    const updated = await pool.query<{
      id: string;
      member1_sparked: boolean;
      member2_sparked: boolean;
      status: string;
    }>(
      `UPDATE duo_sparks SET ${field} = true, expires_at = $2
        WHERE from_duo_id = $1
          AND (to_duo_id = $3 OR to_user_id = $4)
          AND status = 'pending'
        RETURNING id, member1_sparked, member2_sparked, status`,
      [fromDuoId, expiresAt, toDuoId ?? null, toUserId ?? null],
    );
    if (!updated.rows[0]) throw badRequest('Duo spark not found or expired.');
    sparkId = updated.rows[0].id;
    member1Sparked = updated.rows[0].member1_sparked;
    member2Sparked = updated.rows[0].member2_sparked;
  }

  const bothMembersSparked = member1Sparked && member2Sparked;
  return { duoSparkId: sparkId, isMutual: false, bothMembersSparked };
}

/** Check if the target (duo or user) has a pending spark back toward fromDuo — creates a group match. */
export async function checkDuoMutualMatch(params: {
  fromDuoId: string;
  toDuoId?: string;
  toUserId?: string;
}): Promise<{ matchId: string | null }> {
  // Mutual duo–duo: check if to_duo has also sparked from_duo with both members
  if (params.toDuoId) {
    const { rows } = await pool.query<{ id: string; member1_sparked: boolean; member2_sparked: boolean }>(
      `SELECT id, member1_sparked, member2_sparked
         FROM duo_sparks
        WHERE from_duo_id = $1
          AND to_duo_id = $2
          AND status = 'pending'
          AND expires_at > NOW()`,
      [params.toDuoId, params.fromDuoId],
    );
    if (rows[0]?.member1_sparked && rows[0]?.member2_sparked) {
      // Create group match
      const gm = await pool.query<{ id: string }>(
        `INSERT INTO group_matches (duo_a_id, duo_b_id)
         VALUES ($1, $2)
         RETURNING id`,
        [params.fromDuoId, params.toDuoId],
      );
      const matchId = gm.rows[0]!.id;

      // Mark both duo sparks as mutual
      await pool.query(
        `UPDATE duo_sparks SET status = 'mutual', match_id = $3
          WHERE (from_duo_id = $1 AND to_duo_id = $2)
             OR (from_duo_id = $2 AND to_duo_id = $1)`,
        [params.fromDuoId, params.toDuoId, matchId],
      );

      // Add all 4 members to group_match_members
      await pool.query(
        `INSERT INTO group_match_members (group_match_id, user_id)
         SELECT $1, u.id FROM (
           SELECT inviter_id AS id FROM duos WHERE id IN ($2,$3)
           UNION ALL
           SELECT partner_id AS id FROM duos WHERE id IN ($2,$3)
         ) u`,
        [matchId, params.fromDuoId, params.toDuoId],
      );

      return { matchId };
    }
  }
  return { matchId: null };
}

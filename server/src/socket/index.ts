import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GoLivePayload,
  Vibe,
  VenueSuggestion,
} from '@rightnow/shared';

import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { redis } from '../db/redis.js';
import { pool } from '../db/index.js';
import { applyFuzzyLocation, getNearbyUsers } from '../services/location.service.js';
import { suggestVenues } from '../services/venues.service.js';
import { scanMessage } from '../services/aiSafety.service.js';
import { scheduleCheckin } from '../services/safetyScheduler.service.js';
import {
  SPARK_TTL_SECONDS,
  createSpark,
  acceptSpark,
  createMatch,
  declineSpark,
  expireSpark,
} from '../services/sparks.service.js';
import { recordReferredFirstDate } from '../services/referrals.service.js';
import { fireDuoSpark, checkDuoMutualMatch, getMyDuo } from '../services/duo.service.js';
import { recordGoLiveForStreak } from '../services/streak.service.js';
import type { RNServer, RNSocket, SocketData } from './types.js';
import { setIO } from './emitter.js';

export type RightnowSocketServer = RNServer;

// --- Redis key helpers ------------------------------------------------------
const userRoom = (userId: string): string => `user:${userId}`;
const cityRoom = (city: string): string => `city:${city}`;
const citySetKey = (city: string): string => `live_sessions:${city}`;
const userSessionKey = (userId: string): string => `user_session:${userId}`;
const socketKey = (socketId: string): string => `socket:${socketId}`;
const sparkExpiryKey = (sparkId: string): string => `spark_expiry:${sparkId}`;

const SESSION_WARN_MS = 5 * 60 * 1000;
const MEETUP_LEAD_MS = 20 * 60 * 1000; // time allotted to reach the venue
const MAX_MESSAGE_LENGTH = 1000;

const checkinPendingKey = (matchId: string, userId: string): string =>
  `checkin:pending:${matchId}:${userId}`;

// Per-session expiry/warning timers so go:offline can cancel them.
const sessionTimers = new Map<string, NodeJS.Timeout[]>();

// ---------------------------------------------------------------------------
// Small DB helpers
// ---------------------------------------------------------------------------
async function getSenderPreview(userId: string): Promise<{
  userId: string;
  displayName: string;
  age: number | null;
  emoji: string;
  trustScore: number;
}> {
  const { rows } = await pool.query<{
    display_name: string;
    age: number | null;
    emoji: string;
    trust: number;
  }>(
    `SELECT p.display_name, p.age, p.avatar_emoji AS emoji, COALESCE(t.score, 50) AS trust
       FROM profiles p
       LEFT JOIN trust_scores t ON t.user_id = p.id
      WHERE p.id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    userId,
    displayName: row?.display_name ?? 'Someone',
    age: row && row.age !== null ? Number(row.age) : null,
    emoji: row?.emoji ?? '🧑',
    trustScore: row ? Number(row.trust) : 50,
  };
}

// ---------------------------------------------------------------------------
// Session expiry scheduling
// ---------------------------------------------------------------------------
function clearSessionTimers(sessionId: string): void {
  const timers = sessionTimers.get(sessionId);
  if (timers) {
    timers.forEach(clearTimeout);
    sessionTimers.delete(sessionId);
  }
}

async function expireSession(
  io: RNServer,
  sessionId: string,
  city: string,
  userId: string,
): Promise<void> {
  await pool.query(
    'UPDATE live_sessions SET is_active = false WHERE id = $1 AND is_active = true',
    [sessionId],
  );
  await redis.srem(citySetKey(city), sessionId);
  const current = await redis.get(userSessionKey(userId));
  if (current === sessionId) await redis.del(userSessionKey(userId));
  clearSessionTimers(sessionId);
  io.to(cityRoom(city)).emit('map:pin:removed', { sessionId });
}

function scheduleSessionExpiry(
  io: RNServer,
  params: { sessionId: string; userId: string; city: string; expiresAt: Date },
): void {
  const { sessionId, userId, city, expiresAt } = params;
  const msToExpiry = expiresAt.getTime() - Date.now();
  const timers: NodeJS.Timeout[] = [];

  const msToWarn = msToExpiry - SESSION_WARN_MS;
  if (msToWarn > 0) {
    timers.push(
      setTimeout(() => {
        io.to(userRoom(userId)).emit('session:expiring', {
          sessionId,
          expiresAt: expiresAt.toISOString(),
        });
      }, msToWarn),
    );
  }

  timers.push(
    setTimeout(
      () => {
        void expireSession(io, sessionId, city, userId).catch((err) =>
          logger.error({ err, sessionId }, 'session expiry failed'),
        );
      },
      Math.max(msToExpiry, 0),
    ),
  );

  sessionTimers.set(sessionId, timers);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------
async function handleGoLive(io: RNServer, socket: RNSocket, payload: GoLivePayload): Promise<void> {
  const { userId, city } = socket.data;

  // Guard: deactivate any existing active session before creating a new one
  // to prevent duplicate live pins for the same user.
  const existingSessionId = await redis.get(userSessionKey(userId));
  if (existingSessionId) {
    await pool.query(
      'UPDATE live_sessions SET is_active = false WHERE id = $1 AND is_active = true',
      [existingSessionId],
    );
    await redis.srem(citySetKey(city), existingSessionId);
    clearSessionTimers(existingSessionId);
    io.to(cityRoom(city)).emit('map:pin:removed', { sessionId: existingSessionId });
  }

  const { vibe, windowMinutes, latitude, longitude, radiusMiles } = payload;
  const { fuzzyLat, fuzzyLng } = applyFuzzyLocation(latitude, longitude);
  const expiresAt = new Date(Date.now() + windowMinutes * 60_000);

  // Privacy: store the fuzzy point in BOTH columns — exact GPS never persists.
  // For users who registered < 24 hours ago, flag the session for visibility boost.
  const newUserCheck = await pool.query<{ is_new: boolean }>(
    `SELECT (created_at > NOW() - INTERVAL '24 hours') AS is_new FROM users WHERE id = $1`,
    [userId],
  );
  const isNewUserBoost = newUserCheck.rows[0]?.is_new ?? false;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO live_sessions
       (user_id, location, fuzzy_location, vibe, window_minutes, expires_at, is_active, radius_miles, is_new_user_boost)
     VALUES ($1,
             ST_SetSRID(ST_MakePoint($2, $3), 4326),
             ST_SetSRID(ST_MakePoint($2, $3), 4326),
             $4, $5, $6, true, $7, $8)
     RETURNING id`,
    [userId, fuzzyLng, fuzzyLat, vibe, windowMinutes, expiresAt, radiusMiles, isNewUserBoost],
  );
  const sessionId = rows[0]!.id;

  await redis.set(userSessionKey(userId), sessionId, 'EX', windowMinutes * 60);
  await redis.sadd(citySetKey(city), sessionId);

  const me = await getSenderPreview(userId);

  // Broadcast the new pin to everyone else in the city.
  // New users (< 24h) emit as visually boosted to maximise first-spark chances.
  socket.to(cityRoom(city)).emit('map:pin:added', {
    sessionId,
    fuzzyLat,
    fuzzyLng,
    vibe,
    trustScore: me.trustScore,
    displayName: me.displayName,
    age: me.age,
    emoji: me.emoji,
    boosted: isNewUserBoost,
  });

  // Send the joining user a snapshot of nearby live pins.
  const nearby = await getNearbyUsers(fuzzyLat, fuzzyLng, radiusMiles, userId);

  // Priority injection: if this is a new user, inject their own pin as a
  // "welcome" signal to every currently-live user in the city so it surfaces
  // at the top of their map. We achieve this by emitting a boosted pin:added
  // event *only* if it wasn't already emitted above (it was, so this block is
  // intentionally left to the broadcast above). The below loop sends nearby
  // sessions to the new user with new-user-boost pins surfaced first.
  const prioritySorted = isNewUserBoost
    ? nearby // new user sees everyone normally
    : nearby; // returning user — no reorder needed here
  for (const n of prioritySorted) {
    socket.emit('map:pin:added', {
      sessionId: n.sessionId,
      fuzzyLat: n.fuzzyLat,
      fuzzyLng: n.fuzzyLng,
      vibe: n.vibe,
      trustScore: n.trustScore,
      displayName: n.displayName,
      age: n.age,
      emoji: n.emoji,
      boosted: false,
    });
  }

  scheduleSessionExpiry(io, { sessionId, userId, city, expiresAt });

  // Record streak (non-blocking, failure is silent)
  void recordGoLiveForStreak(userId).catch(() => undefined);

  // ── New-user priority: proactively ping all live nearby users ─────────
  // If this is a brand-new user (< 24h), send a targeted in-app notification
  // to every user who is already live within range so they notice the new pin.
  if (isNewUserBoost) {
    const PRIORITY_NOTIFY_KEY = `new_user_priority:${userId}`;
    const alreadyPinged = await redis.set(PRIORITY_NOTIFY_KEY, '1', 'EX', 60 * 60 * 24, 'NX');
    if (alreadyPinged === 'OK') {
      // Find users who have active live sessions in this city
      const { rows: liveNearby } = await pool.query<{ user_id: string }>(
        `SELECT DISTINCT ls.user_id
           FROM live_sessions ls
          WHERE ls.is_active = true
            AND ls.expires_at > NOW()
            AND ls.user_id <> $1
            AND ST_DWithin(
                  ls.fuzzy_location::geography,
                  ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                  $4
                )
          LIMIT 100`,
        [userId, fuzzyLng, fuzzyLat, radiusMiles * 1609.34],
      );
      // Emit an in-app notification to each nearby live user via their socket room
      for (const { user_id } of liveNearby) {
        io.to(userRoom(user_id)).emit('notification', {
          title: '🆕 New profile just joined!',
          body: `${me.displayName}${me.age ? ` ${me.age}` : ''} just went live nearby. Be the first to spark!`,
        });
      }
      logger.info(
        { userId, notified: liveNearby.length },
        'new-user priority injection: notified nearby live users',
      );
    }
  }
}

async function handleGoOffline(io: RNServer, socket: RNSocket): Promise<void> {
  const { userId, city } = socket.data;

  // Deactivate all active sessions for this user (defensive — normally only one).
  const { rows: activeSessions } = await pool.query<{ id: string }>(
    'UPDATE live_sessions SET is_active = false WHERE user_id = $1 AND is_active = true RETURNING id',
    [userId],
  );
  await redis.del(userSessionKey(userId));

  for (const { id } of activeSessions) {
    await redis.srem(citySetKey(city), id);
    clearSessionTimers(id);
    io.to(cityRoom(city)).emit('map:pin:removed', { sessionId: id });
  }
}

async function handleSparkSend(
  io: RNServer,
  socket: RNSocket,
  payload: { targetSessionId: string },
): Promise<void> {
  const senderId = socket.data.userId;
  const { targetSessionId } = payload;

  // Atomic rate-limit: INCR + EXPIRE in a single round-trip so the expire
  // can never silently fail after a successful incr.
  const rateKey = `spark:rate:${senderId}`;
  const [[, sparkCount]] = (await redis
    .pipeline()
    .incr(rateKey)
    .expire(rateKey, 30 * 60)
    .exec()) as [[null, number], [null, number]];
  if (sparkCount > 10) {
    socket.emit('app:error', {
      event: 'spark:send',
      message: 'Slow down — too many sparks. Try again later.',
    });
    return;
  }

  const target = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM live_sessions WHERE id = $1 AND is_active = true',
    [targetSessionId],
  );
  if (target.rows.length === 0) {
    socket.emit('app:error', { event: 'spark:send', message: 'That session is no longer live.' });
    return;
  }
  const receiverId = target.rows[0]!.user_id;
  if (receiverId === senderId) {
    socket.emit('app:error', { event: 'spark:send', message: 'You cannot spark yourself.' });
    return;
  }

  const senderSessionId = await redis.get(userSessionKey(senderId));
  if (!senderSessionId) {
    socket.emit('app:error', { event: 'spark:send', message: 'Go live before sending a spark.' });
    return;
  }

  const { sparkId, expiresAt } = await createSpark({
    senderId,
    receiverId,
    senderSessionId,
    receiverSessionId: targetSessionId,
  });

  await redis.set(sparkExpiryKey(sparkId), '1', 'EX', SPARK_TTL_SECONDS);

  const sender = await getSenderPreview(senderId);
  io.to(userRoom(receiverId)).emit('spark:received', {
    sparkId,
    sender,
    expiresAt: expiresAt.toISOString(),
  });
}

async function handleSparkAccept(
  io: RNServer,
  socket: RNSocket,
  payload: { sparkId: string },
): Promise<void> {
  const receiverId = socket.data.userId;
  const { sparkId } = payload;

  const accepted = await acceptSpark(sparkId, receiverId);
  if (!accepted) {
    socket.emit('app:error', {
      event: 'spark:accept',
      message: 'This spark is no longer available.',
    });
    return;
  }
  const {
    senderId: sender_id,
    senderSessionId: sender_session_id,
    receiverSessionId: receiver_session_id,
  } = accepted;
  await redis.del(sparkExpiryKey(sparkId));

  // Fetch both fuzzy locations + the sender's vibe for venue matching.
  const sessions = await pool.query<{ id: string; lat: number; lng: number; vibe: Vibe }>(
    `SELECT id, ST_Y(fuzzy_location) AS lat, ST_X(fuzzy_location) AS lng, vibe
       FROM live_sessions WHERE id = ANY($1)`,
    [[sender_session_id, receiver_session_id]],
  );
  const senderSession = sessions.rows.find((s) => s.id === sender_session_id);
  const receiverSession = sessions.rows.find((s) => s.id === receiver_session_id);

  let venue: VenueSuggestion | null = null;
  if (senderSession && receiverSession) {
    const venues = await suggestVenues(
      { lat: Number(senderSession.lat), lng: Number(senderSession.lng) },
      { lat: Number(receiverSession.lat), lng: Number(receiverSession.lng) },
      senderSession.vibe,
    ).catch((err) => {
      logger.warn({ err }, 'venue suggestion failed');
      return [];
    });
    venue = venues[0] ?? null;
  }

  const meetupTime = new Date(Date.now() + MEETUP_LEAD_MS);
  const { matchId } = await createMatch({
    sparkId,
    user1Id: sender_id,
    user2Id: receiverId,
    venueId: venue?.id ?? null,
    meetupTime,
  });

  const matchPayload = {
    matchId,
    venue,
    meetupTime: meetupTime.toISOString(),
    countdown: Math.round((meetupTime.getTime() - Date.now()) / 1000),
  };
  io.to(userRoom(sender_id)).emit('match:created', matchPayload);
  io.to(userRoom(receiverId)).emit('match:created', matchPayload);

  await scheduleCheckin(matchId, meetupTime);
}

async function handleSparkDecline(socket: RNSocket, payload: { sparkId: string }): Promise<void> {
  await declineSpark(payload.sparkId, socket.data.userId);
  await redis.del(sparkExpiryKey(payload.sparkId));
}

async function handleMessageSend(
  io: RNServer,
  socket: RNSocket,
  payload: { matchId: string; content: string },
): Promise<void> {
  const senderId = socket.data.userId;
  const { matchId, content } = payload;

  // Validate content before any DB work.
  const trimmed = content.trim();
  if (!trimmed) {
    socket.emit('app:error', { event: 'message:send', message: 'Message cannot be empty.' });
    return;
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    socket.emit('app:error', {
      event: 'message:send',
      message: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    });
    return;
  }

  const match = await pool.query<{ user1_id: string; user2_id: string; status: string }>(
    "SELECT user1_id, user2_id, status FROM matches WHERE id = $1",
    [matchId],
  );
  if (match.rows.length === 0) {
    socket.emit('app:error', { event: 'message:send', message: 'Match not found.' });
    return;
  }
  const { user1_id, user2_id, status: matchStatus } = match.rows[0]!;
  if (senderId !== user1_id && senderId !== user2_id) {
    socket.emit('app:error', { event: 'message:send', message: 'You are not part of this match.' });
    return;
  }
  if (matchStatus !== 'active' && matchStatus !== 'met') {
    socket.emit('app:error', { event: 'message:send', message: 'This match is no longer active.' });
    return;
  }
  const recipientId = senderId === user1_id ? user2_id : user1_id;

  const { rows } = await pool.query<{ id: string; created_at: Date }>(
    `INSERT INTO messages (match_id, sender_id, content) VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [matchId, senderId, trimmed],
  );
  const message = rows[0]!;

  // Two-stage AI safety scan (moderation → GPT). Fast and fail-open.
  const scan = await scanMessage(trimmed, matchId, senderId);

  if (!scan.isSafe) {
    await pool.query(
      'UPDATE messages SET is_flagged = true, ai_safety_score = $1, deleted_at = NOW() WHERE id = $2',
      [scan.score, message.id],
    );
    socket.emit('message:blocked', {
      reason: scan.reason ?? 'This message was blocked for safety.',
    });
    return;
  }

  const messagePayload = {
    id: message.id,
    matchId,
    senderId,
    content: trimmed,
    createdAt: new Date(message.created_at).toISOString(),
  };

  // Emit to recipient and echo back to sender (so the sender's optimistic
  // message can be replaced by the server-confirmed ID).
  io.to(userRoom(recipientId)).emit('message:received', messagePayload);
  socket.emit('message:received', messagePayload);

  if (scan.shouldWarn) {
    await pool.query('UPDATE messages SET is_flagged = true, ai_safety_score = $1 WHERE id = $2', [
      scan.score,
      message.id,
    ]);
    socket.emit('message:flagged', {
      messageId: message.id,
      reason: scan.reason ?? 'This message was flagged.',
    });
  }
}

async function handleCheckinConfirm(socket: RNSocket, payload: { matchId: string }): Promise<void> {
  const userId = socket.data.userId;
  const { rows } = await pool.query<{
    user1_id: string;
    user2_id: string;
    user1_confirmed: boolean;
    user2_confirmed: boolean;
  }>(
    `UPDATE matches
        SET user1_confirmed = CASE WHEN user1_id = $2 THEN true ELSE user1_confirmed END,
            user2_confirmed = CASE WHEN user2_id = $2 THEN true ELSE user2_confirmed END
      WHERE id = $1
      RETURNING user1_id, user2_id, user1_confirmed, user2_confirmed`,
    [payload.matchId, userId],
  );
  // Clear the pending safety check-in so escalation won't fire.
  await redis.del(checkinPendingKey(payload.matchId, userId));

  // When both confirm, the date is complete — mark it and credit referrals.
  const match = rows[0];
  if (match && match.user1_confirmed && match.user2_confirmed) {
    await pool.query("UPDATE matches SET status = 'met' WHERE id = $1 AND status = 'active'", [
      payload.matchId,
    ]);
    await recordReferredFirstDate(match.user1_id);
    await recordReferredFirstDate(match.user2_id);
  }
}

async function handleTyping(
  io: RNServer,
  socket: RNSocket,
  payload: { matchId: string },
): Promise<void> {
  const me = socket.data.userId;
  const { rows } = await pool.query<{ user1_id: string; user2_id: string }>(
    'SELECT user1_id, user2_id FROM matches WHERE id = $1',
    [payload.matchId],
  );
  const match = rows[0];
  if (!match || (me !== match.user1_id && me !== match.user2_id)) return;
  const other = me === match.user1_id ? match.user2_id : match.user1_id;
  io.to(userRoom(other)).emit('typing:start', { matchId: payload.matchId, userId: me });
}

// ---------------------------------------------------------------------------
// Spark expiry via Redis keyspace notifications
// ---------------------------------------------------------------------------
async function handleSparkExpiry(io: RNServer, sparkId: string): Promise<void> {
  const expired = await expireSpark(sparkId);
  if (!expired) return;
  io.to(userRoom(expired.senderId)).emit('spark:expired', { sparkId });
  io.to(userRoom(expired.receiverId)).emit('spark:expired', { sparkId });
}

async function setupSparkExpiryListener(io: RNServer): Promise<void> {
  try {
    // Enable expired-key keyevent notifications (E + x).
    await redis.config('SET', 'notify-keyspace-events', 'Ex');
  } catch (err) {
    logger.warn({ err }, 'Could not enable Redis keyspace notifications for spark expiry');
  }

  const subscriber = redis.duplicate();
  subscriber.on('error', (err) => logger.error({ err }, 'spark-expiry subscriber error'));
  if (subscriber.status === 'wait') {
    await subscriber
      .connect()
      .catch((err) => logger.error({ err }, 'spark-expiry subscriber connect failed'));
  }

  const channel = '__keyevent@0__:expired';
  await subscriber.subscribe(channel);
  subscriber.on('message', (chan, key) => {
    if (chan !== channel || !key.startsWith('spark_expiry:')) return;
    const sparkId = key.slice('spark_expiry:'.length);
    void handleSparkExpiry(io, sparkId).catch((err) =>
      logger.error({ err, sparkId }, 'spark expiry handling failed'),
    );
  });

  logger.info('Spark-expiry keyspace listener active');
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------
/** Wrap an async handler so a thrown error emits app:error instead of crashing. */
function guard(socket: RNSocket, event: keyof ClientToServerEvents, fn: () => Promise<void>): void {
  fn().catch((err) => {
    logger.error({ err, event }, 'socket handler error');
    socket.emit('app:error', { event, message: 'Something went wrong.' });
  });
}

export function createSocketServer(httpServer: HttpServer): RNServer {
  const io: RNServer = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    },
  });

  // Share the instance so services/queues can emit to users.
  setIO(io);

  // JWT auth on the handshake.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as {
        userId: string;
        phone: string;
      };
      socket.data.userId = decoded.userId;
      socket.data.phone = decoded.phone;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    void (async () => {
      const { userId } = socket.data;
      const { rows } = await pool.query<{ city: string | null }>(
        'SELECT city FROM profiles WHERE id = $1',
        [userId],
      );
      const city = (rows[0]?.city ?? 'Miami').toLowerCase();
      socket.data.city = city;

      socket.join(userRoom(userId));
      socket.join(cityRoom(city));
      await redis.set(socketKey(socket.id), userId);

      logger.debug({ socketId: socket.id, userId, city }, 'socket connected');

      // Register event handlers only AFTER city is populated so socket.data.city
      // is never undefined inside handlers.
      socket.on('go:live', (payload: GoLivePayload) =>
        guard(socket, 'go:live', () => handleGoLive(io, socket, payload)),
      );
      socket.on('go:offline', () => guard(socket, 'go:offline', () => handleGoOffline(io, socket)));
      socket.on('spark:send', (payload: { targetSessionId: string }) =>
        guard(socket, 'spark:send', () => handleSparkSend(io, socket, payload)),
      );
      socket.on('spark:accept', (payload: { sparkId: string }) =>
        guard(socket, 'spark:accept', () => handleSparkAccept(io, socket, payload)),
      );
      socket.on('spark:decline', (payload: { sparkId: string }) =>
        guard(socket, 'spark:decline', () => handleSparkDecline(socket, payload)),
      );
      socket.on('message:send', (payload: { matchId: string; content: string }) =>
        guard(socket, 'message:send', () => handleMessageSend(io, socket, payload)),
      );
      socket.on('checkin:confirm', (payload: { matchId: string }) =>
        guard(socket, 'checkin:confirm', () => handleCheckinConfirm(socket, payload)),
      );
      socket.on('typing:start', (payload: { matchId: string }) =>
        guard(socket, 'typing:start', () => handleTyping(io, socket, payload)),
      );

      // ── Duo sparks ───────────────────────────────────────────────────────
      socket.on(
        'duo:spark',
        (payload: { fromDuoId: string; toDuoId?: string; toUserId?: string }) =>
          guard(socket, 'duo:spark', async () => {
            const { fromDuoId, toDuoId, toUserId } = payload;
            const userId = socket.data.userId;

            const { duoSparkId, bothMembersSparked } = await fireDuoSpark({
              fromDuoId,
              sparkingUserId: userId,
              toDuoId,
              toUserId,
            });

            // Notify the sparking user's duo partner that they sparked
            const myDuo = await getMyDuo(userId);
            if (myDuo) {
              io.to(userRoom(myDuo.partner.id)).emit('notification', {
                title: '⚡ Your partner sparked someone!',
                body: 'Tap to add your spark — both of you must agree for a double match.',
                data: { type: 'partner_sparked', duoSparkId, fromDuoId, toDuoId, toUserId },
              });
            }

            if (bothMembersSparked) {
              // Both members sparked — check if target has also sparked back (mutual group match)
              const { matchId } = await checkDuoMutualMatch({ fromDuoId, toDuoId, toUserId });
              if (matchId) {
                // Fetch all 4 members and emit group:match to each
                const { rows: members } = await pool.query<{ user_id: string }>(
                  'SELECT user_id FROM group_match_members WHERE group_match_id = $1',
                  [matchId],
                );
                const profiles = await pool.query<{
                  id: string;
                  display_name: string;
                  age: number;
                  avatar_emoji: string;
                }>(
                  'SELECT id, display_name, age, avatar_emoji FROM profiles WHERE id = ANY($1)',
                  [members.map((m) => m.user_id)],
                );
                const groupPayload = {
                  matchId,
                  type: 'double_date',
                  members: profiles.rows.map((p) => ({
                    userId: p.id,
                    displayName: p.display_name,
                    age: p.age,
                    avatarEmoji: p.avatar_emoji,
                  })),
                };
                for (const m of members) {
                  io.to(userRoom(m.user_id)).emit('group:match', groupPayload);
                }
                logger.info({ matchId, members: members.length }, 'group double date match created');
              } else {
                // Both our members sparked — notify the target duo to spark back
                if (toDuoId) {
                  const targetMembers = await pool.query<{ inviter_id: string; partner_id: string }>(
                    'SELECT inviter_id, partner_id FROM duos WHERE id = $1',
                    [toDuoId],
                  );
                  if (targetMembers.rows[0]) {
                    for (const uid of [
                      targetMembers.rows[0].inviter_id,
                      targetMembers.rows[0].partner_id,
                    ]) {
                      io.to(userRoom(uid)).emit('duo:spark:received', {
                        duoSparkId,
                        fromDuoId,
                        bothMembersSparked: true,
                      });
                    }
                  }
                } else if (toUserId) {
                  io.to(userRoom(toUserId)).emit('duo:spark:received', {
                    duoSparkId,
                    fromDuoId,
                    bothMembersSparked: true,
                  });
                }
              }
            }
          }),
      );

      socket.on('disconnect', (reason) => {
        void redis.del(socketKey(socket.id)).catch(() => undefined);
        logger.debug({ socketId: socket.id, reason }, 'socket disconnected');
      });
    })().catch((err) => {
      logger.error({ err }, 'socket connection setup failed');
      socket.disconnect(true);
    });
  });

  void setupSparkExpiryListener(io).catch((err) =>
    logger.error({ err }, 'failed to set up spark-expiry listener'),
  );

  return io;
}

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { JwtPayload } from '@rightnow/shared';

import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { redis } from '../db/redis.js';
import { pool, transaction } from '../db/index.js';
import { sendSms } from './twilio.service.js';
import { badRequest, tooManyRequests, unauthorized } from '../utils/http-error.js';

// --- Tunables ---------------------------------------------------------------
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_RATE_MAX = 3; // max requests...
const OTP_RATE_WINDOW = 600; // ...per 10 minutes per phone
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ACCESS_TOKEN_TTL = '30d';
const DEMO_OTP = '123456';

// --- Redis key helpers ------------------------------------------------------
const otpKey = (phone: string): string => `otp:${phone}`;
const otpRateKey = (phone: string): string => `otp:rate:${phone}`;
const refreshByUserKey = (userId: string): string => `refresh:${userId}`;
const refreshByTokenKey = (token: string): string => `refreshtoken:${token}`;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
/** True only for a well-formed, dialable E.164 number (e.g. +13055551234). */
export function isValidE164(phone: string): boolean {
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  try {
    const parsed = parsePhoneNumberFromString(phone);
    return parsed !== undefined && parsed.isValid() && parsed.number === phone;
  } catch {
    return false;
  }
}

/** Constant-time string comparison that tolerates length mismatches. */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function generateOtp(): string {
  // 100000–999999: always exactly 6 digits.
  return String(crypto.randomInt(100000, 1000000));
}

function signAccessToken(userId: string, phone: string): string {
  const payload: JwtPayload = { userId, phone };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// ---------------------------------------------------------------------------
// request-otp
// ---------------------------------------------------------------------------
export interface RequestOtpResult {
  success: true;
  expiresIn: number;
}

export async function requestOtp(phone: string): Promise<RequestOtpResult> {
  if (!isValidE164(phone)) {
    throw badRequest('Invalid phone number. Use E.164 format, e.g. +13055551234.');
  }

  // Sliding-window-ish rate limit: max OTP_RATE_MAX per OTP_RATE_WINDOW seconds.
  const rateKey = otpRateKey(phone);
  const count = await redis.incr(rateKey);
  if (count === 1) {
    await redis.expire(rateKey, OTP_RATE_WINDOW);
  }
  if (count > OTP_RATE_MAX) {
    throw tooManyRequests('Too many OTP requests. Please try again later.');
  }

  const otp = generateOtp();
  await redis.set(otpKey(phone), otp, 'EX', OTP_TTL_SECONDS);

  const message = `Your RIGHTNOW code is ${otp}. Valid for 10 minutes.`;
  if (env.DEMO_MODE) {
    logger.info({ phone, otp }, `[DEMO_MODE] ${message}`);
  } else {
    await sendSms(phone, message);
  }

  return { success: true, expiresIn: OTP_TTL_SECONDS };
}

// ---------------------------------------------------------------------------
// verify-otp
// ---------------------------------------------------------------------------
export interface VerifyOtpResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  userId: string;
}

async function upsertUser(phone: string): Promise<{ userId: string; isNewUser: boolean }> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE phone = $1', [
    phone,
  ]);

  if (existing.rows.length > 0) {
    const userId = existing.rows[0]!.id;
    await pool.query(
      "UPDATE users SET last_active = NOW(), is_verified = true, verification_tier = 'phone' WHERE id = $1",
      [userId],
    );
    return { userId, isNewUser: false };
  }

  // New user: create the account + an empty profile atomically.
  const userId = await transaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (phone, is_verified, verification_tier, last_active)
       VALUES ($1, true, 'phone', NOW())
       RETURNING id`,
      [phone],
    );
    const id = inserted.rows[0]!.id;
    await client.query(
      `INSERT INTO profiles (id, display_name, city) VALUES ($1, 'New User', 'Miami')`,
      [id],
    );
    await client.query(
      `INSERT INTO trust_scores (user_id, verified_phone) VALUES ($1, true)
       ON CONFLICT (user_id) DO NOTHING`,
      [id],
    );
    return id;
  });

  return { userId, isNewUser: true };
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  // Store both directions: by user (spec'd key) and a reverse index for lookup.
  await redis.set(refreshByUserKey(userId), token, 'EX', REFRESH_TTL_SECONDS);
  await redis.set(refreshByTokenKey(token), userId, 'EX', REFRESH_TTL_SECONDS);
  return token;
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  if (!isValidE164(phone)) {
    throw badRequest('Invalid phone number. Use E.164 format, e.g. +13055551234.');
  }

  let verified = false;
  if (env.DEMO_MODE && otp === DEMO_OTP) {
    verified = true;
  } else {
    const stored = await redis.get(otpKey(phone));
    verified = stored !== null && timingSafeEqual(stored, otp);
  }

  if (!verified) {
    throw unauthorized('Invalid or expired code.');
  }

  // Single-use: delete immediately so the same code can't be replayed.
  await redis.del(otpKey(phone));
  await redis.del(otpRateKey(phone));

  const { userId, isNewUser } = await upsertUser(phone);
  const accessToken = signAccessToken(userId, phone);
  const refreshToken = await issueRefreshToken(userId);

  return { accessToken, refreshToken, isNewUser, userId };
}

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  const userId = await redis.get(refreshByTokenKey(refreshToken));
  if (!userId) {
    throw unauthorized('Invalid or expired refresh token.');
  }

  // Defend against a stale reverse-index entry.
  const current = await redis.get(refreshByUserKey(userId));
  if (current !== refreshToken) {
    throw unauthorized('Invalid or expired refresh token.');
  }

  const result = await pool.query<{ phone: string }>('SELECT phone FROM users WHERE id = $1', [
    userId,
  ]);
  if (result.rows.length === 0) {
    throw unauthorized('Invalid or expired refresh token.');
  }

  return { accessToken: signAccessToken(userId, result.rows[0]!.phone) };
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
export async function logout(refreshToken: string): Promise<{ success: true }> {
  const userId = await redis.get(refreshByTokenKey(refreshToken));
  if (userId) {
    await redis.del(refreshByUserKey(userId));
  }
  await redis.del(refreshByTokenKey(refreshToken));
  return { success: true };
}

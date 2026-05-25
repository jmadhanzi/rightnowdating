import twilio, { type Twilio } from 'twilio';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

let client: Twilio | null = null;

function getClient(): Twilio {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio is not configured (missing SID/auth token)');
  }
  client ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
}

/** Send an OTP code via Twilio Verify (preferred) or a raw SMS fallback. */
export async function sendOtp(phone: string): Promise<void> {
  const c = getClient();
  if (env.TWILIO_VERIFY_SERVICE_SID) {
    await c.verify.v2
      .services(env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phone, channel: 'sms' });
    return;
  }
  if (!env.TWILIO_FROM_NUMBER) {
    throw new Error('Twilio Verify service or from-number required to send OTP');
  }
  await c.messages.create({
    to: phone,
    from: env.TWILIO_FROM_NUMBER,
    body: 'Your RIGHTNOW verification code is on its way.',
  });
}

/** Check an OTP code against Twilio Verify. */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  if (!env.TWILIO_VERIFY_SERVICE_SID) {
    throw new Error('Twilio Verify service SID is required to verify OTP');
  }
  const check = await getClient()
    .verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: phone, code });
  logger.debug({ status: check.status }, 'otp verification check');
  return check.status === 'approved';
}

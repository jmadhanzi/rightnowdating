import twilio, { type Twilio } from 'twilio';
import { env } from '../utils/env.js';

let client: Twilio | null = null;

function getClient(): Twilio {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio is not configured (missing SID/auth token)');
  }
  client ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
}

/** Send a plain SMS. Throws if Twilio credentials/from-number are missing. */
export async function sendSms(to: string, body: string): Promise<void> {
  if (!env.TWILIO_FROM_NUMBER) {
    throw new Error('TWILIO_FROM_NUMBER is required to send SMS');
  }
  await getClient().messages.create({ to, from: env.TWILIO_FROM_NUMBER, body });
}

import { safetyCheckQueue } from './queue.service.js';

const CHECKIN_AFTER_MEETUP_MS = 30 * 60 * 1000;

/**
 * Schedule the first post-date safety check-in for 30 minutes after the meetup
 * time. The queue processor handles pinging the users, escalating to trusted
 * contacts if unanswered, and scheduling the follow-up check-in.
 */
export async function scheduleCheckin(matchId: string, meetupTime: Date): Promise<void> {
  const delay = meetupTime.getTime() + CHECKIN_AFTER_MEETUP_MS - Date.now();
  await safetyCheckQueue.add('checkin', { matchId, round: 1 }, { delay: Math.max(delay, 0) });
}

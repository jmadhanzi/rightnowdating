import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { moderateContent, analyzeMessageSafety } from './ai.service.js';

export interface ScanResult {
  isSafe: boolean;
  score: number; // 0 (danger) … 1 (safe)
  reason: string | null;
  shouldWarn: boolean;
}

// Moderation category score above which we escalate to GPT.
const ESCALATE = 0.3;
const BLOCK_BELOW = 0.3;
const WARN_BELOW = 0.6;

async function logScan(params: {
  matchId: string;
  senderId: string;
  content: string;
  action: 'flagged' | 'blocked';
  score: number;
  concern: string | null;
  source: 'moderation' | 'gpt';
  wasBlocked: boolean;
}): Promise<void> {
  await pool
    .query(
      `INSERT INTO moderation_logs (match_id, sender_id, content, action, score, concern, source, was_blocked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.matchId,
        params.senderId,
        params.content,
        params.action,
        params.score,
        params.concern,
        params.source,
        params.wasBlocked,
      ],
    )
    .catch((err) => logger.error({ err }, 'failed to write moderation log'));
}

/**
 * Two-stage scan: cheap moderation first, escalating to GPT-4o-mini only when a
 * category trips the threshold. Fail-open (treats content as safe when OpenAI
 * is unavailable). Flagged/blocked results are logged for human review.
 */
export async function scanMessage(
  content: string,
  matchId: string,
  senderId: string,
): Promise<ScanResult> {
  const moderation = await moderateContent(content);

  if (moderation.flagged) {
    await logScan({
      matchId,
      senderId,
      content,
      action: 'blocked',
      score: 0,
      concern: moderation.category,
      source: 'moderation',
      wasBlocked: true,
    });
    return { isSafe: false, score: 0, reason: moderation.category, shouldWarn: false };
  }

  if (moderation.maxCategoryScore <= ESCALATE) {
    return { isSafe: true, score: 1, reason: null, shouldWarn: false };
  }

  const gpt = await analyzeMessageSafety(content);

  if (gpt.score < BLOCK_BELOW) {
    await logScan({
      matchId,
      senderId,
      content,
      action: 'blocked',
      score: gpt.score,
      concern: gpt.concern,
      source: 'gpt',
      wasBlocked: true,
    });
    return { isSafe: false, score: gpt.score, reason: gpt.concern, shouldWarn: false };
  }

  if (gpt.score <= WARN_BELOW) {
    await logScan({
      matchId,
      senderId,
      content,
      action: 'flagged',
      score: gpt.score,
      concern: gpt.concern,
      source: 'gpt',
      wasBlocked: false,
    });
    return { isSafe: true, score: gpt.score, reason: gpt.concern, shouldWarn: true };
  }

  return { isSafe: true, score: gpt.score, reason: null, shouldWarn: false };
}

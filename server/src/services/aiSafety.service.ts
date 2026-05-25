import { pool } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { moderateContent, analyzeMessageSafety } from './openai.service.js';

export type ScanAction = 'allow' | 'flag' | 'block';

export interface ScanResult {
  action: ScanAction;
  safe: boolean;
  score: number; // 0 (violation) … 1 (safe)
  concern: string | null;
}

// Moderation category score above which we escalate to GPT.
const MODERATION_ESCALATE = 0.3;
// GPT safety-score thresholds.
const BLOCK_BELOW = 0.3;
const FLAG_BELOW = 0.6;

async function logModeration(
  matchId: string,
  senderId: string,
  content: string,
  action: Exclude<ScanAction, 'allow'>,
  score: number,
  concern: string | null,
  source: 'moderation' | 'gpt',
): Promise<void> {
  await pool
    .query(
      `INSERT INTO moderation_logs (match_id, sender_id, content, action, score, concern, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [matchId, senderId, content, action, score, concern, source],
    )
    .catch((err) => logger.error({ err }, 'failed to write moderation log'));
}

/**
 * Two-stage safety scan: cheap moderation first, escalating to GPT-4o-mini only
 * when a category trips the threshold. Returns an action (allow/flag/block) and
 * logs anything flagged or blocked for human review. Designed to run fast and
 * fail-open (treats content as safe if OpenAI is unavailable).
 */
export async function scanMessage(
  content: string,
  matchId: string,
  senderId: string,
): Promise<ScanResult> {
  const moderation = await moderateContent(content);

  if (moderation.maxCategoryScore <= MODERATION_ESCALATE) {
    return { action: 'allow', safe: true, score: 1, concern: null };
  }

  const analysis = await analyzeMessageSafety(content);

  let action: ScanAction = 'allow';
  if (analysis.score < BLOCK_BELOW) action = 'block';
  else if (analysis.score < FLAG_BELOW) action = 'flag';

  if (action !== 'allow') {
    await logModeration(
      matchId,
      senderId,
      content,
      action,
      analysis.score,
      analysis.concern,
      'gpt',
    );
  }

  return {
    action,
    safe: analysis.safe,
    score: analysis.score,
    concern: analysis.concern,
  };
}

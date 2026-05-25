import OpenAI from 'openai';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI is not configured (missing OPENAI_API_KEY)');
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

/** Score a profile bio 0-100 and return a short suggestion. */
export async function scoreBio(bio: string): Promise<{ score: number; tip: string }> {
  const completion = await getClient().chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You rate dating-app bios for a high-energy, spontaneous app called RIGHTNOW. ' +
          'Reply as compact JSON: {"score": number 0-100, "tip": string}.',
      },
      { role: 'user', content: bio },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as { score?: number; tip?: string };
  return { score: parsed.score ?? 0, tip: parsed.tip ?? '' };
}

export interface MessageSafetyResult {
  flagged: boolean;
  score: number; // 0-1, highest category score
  reason: string; // comma-separated flagged categories
}

/**
 * Run an OpenAI moderation check on chat content. Never throws — if OpenAI is
 * not configured or the call fails, returns a safe (unflagged) result so the
 * message pipeline is never blocked.
 */
export async function checkMessageSafety(content: string): Promise<MessageSafetyResult> {
  const safe: MessageSafetyResult = { flagged: false, score: 0, reason: '' };
  if (!env.OPENAI_API_KEY) return safe;

  try {
    const moderation = await getClient().moderations.create({
      model: 'omni-moderation-latest',
      input: content,
    });
    const result = moderation.results[0];
    if (!result) return safe;

    const scores = Object.values(result.category_scores) as number[];
    const reason = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category)
      .join(', ');

    return {
      flagged: result.flagged,
      score: scores.length ? Math.max(...scores) : 0,
      reason,
    };
  } catch (err) {
    logger.warn({ err }, 'AI message safety check failed; treating as safe');
    return safe;
  }
}

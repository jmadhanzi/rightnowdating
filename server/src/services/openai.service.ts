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

/**
 * Fast, cheap OpenAI Moderation pass. Returns the highest category score
 * (0-1). Never throws — returns 0 when OpenAI is unconfigured or errors, so
 * unconfigured environments treat all content as clean.
 */
export async function moderateContent(
  content: string,
): Promise<{ maxCategoryScore: number; flagged: boolean }> {
  if (!env.OPENAI_API_KEY) return { maxCategoryScore: 0, flagged: false };
  try {
    const moderation = await getClient().moderations.create({
      model: 'omni-moderation-latest',
      input: content,
    });
    const result = moderation.results[0];
    if (!result) return { maxCategoryScore: 0, flagged: false };
    const scores = Object.values(result.category_scores) as number[];
    return {
      maxCategoryScore: scores.length ? Math.max(...scores) : 0,
      flagged: result.flagged,
    };
  } catch (err) {
    logger.warn({ err }, 'OpenAI moderation failed; treating as clean');
    return { maxCategoryScore: 0, flagged: false };
  }
}

export interface MessageSafetyAnalysis {
  safe: boolean;
  score: number; // 0 (clear violation) … 1 (clearly safe)
  concern: string | null;
}

/**
 * Deeper GPT analysis for messages that tripped moderation. `score` is a
 * safety score where lower means more dangerous. Fail-safe to "safe".
 */
export async function analyzeMessageSafety(content: string): Promise<MessageSafetyAnalysis> {
  const safe: MessageSafetyAnalysis = { safe: true, score: 1, concern: null };
  if (!env.OPENAI_API_KEY) return safe;
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Analyze this pre-date message for coercion, pressure tactics, explicit ' +
            'unsolicited content, threats, requests for personal location, or harassment. ' +
            'Return JSON only: { "safe": boolean, "score": number from 0 to 1, "concern": string or null }',
        },
        { role: 'user', content },
      ],
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<MessageSafetyAnalysis>;
    return {
      safe: parsed.safe ?? true,
      score: typeof parsed.score === 'number' ? parsed.score : 1,
      concern: parsed.concern ?? null,
    };
  } catch (err) {
    logger.warn({ err }, 'GPT message analysis failed; treating as safe');
    return safe;
  }
}

/**
 * Vision check: does the selfie show the same person as the profile photo?
 * Returns false when OpenAI is unconfigured or on error.
 */
export async function comparePhotos(selfieBase64: string, photoUrl: string): Promise<boolean> {
  if (!env.OPENAI_API_KEY) return false;
  const selfieUrl = selfieBase64.startsWith('data:')
    ? selfieBase64
    : `data:image/jpeg;base64,${selfieBase64}`;
  try {
    const completion = await getClient().chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Do these two images show the same person? Answer only yes or no.',
            },
            { type: 'image_url', image_url: { url: photoUrl } },
            { type: 'image_url', image_url: { url: selfieUrl } },
          ],
        },
      ],
    });
    const answer = (completion.choices[0]?.message?.content ?? '').trim().toLowerCase();
    return answer.startsWith('yes');
  } catch (err) {
    logger.warn({ err }, 'OpenAI photo comparison failed');
    return false;
  }
}

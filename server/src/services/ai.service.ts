import crypto from 'node:crypto';
import OpenAI from 'openai';
import { env } from '../utils/env.js';
import { logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { redis } from '../db/redis.js';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!env.OPENAI_API_KEY) throw new Error('OpenAI is not configured (missing OPENAI_API_KEY)');
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}

export function isAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

// --- Cost tracking ----------------------------------------------------------
// gpt-4o-mini pricing (USD per token).
const PRICE_INPUT = 0.15 / 1_000_000;
const PRICE_OUTPUT = 0.6 / 1_000_000;

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export async function logTokenUsage(endpoint: string, usage: Usage | undefined): Promise<void> {
  const prompt = usage?.prompt_tokens ?? 0;
  const completion = usage?.completion_tokens ?? 0;
  const total = usage?.total_tokens ?? prompt + completion;
  const cost = prompt * PRICE_INPUT + completion * PRICE_OUTPUT;
  try {
    await pool.query(
      'INSERT INTO daily_costs (endpoint, tokens_used, estimated_cost) VALUES ($1, $2, $3)',
      [endpoint, total, cost],
    );
    await checkDailyBudget();
  } catch (err) {
    logger.warn({ err }, 'failed to log token usage');
  }
}

/** Warn + alert if today's estimated OpenAI spend exceeds the budget. */
async function checkDailyBudget(): Promise<void> {
  const { rows } = await pool.query<{ total: number }>(
    'SELECT COALESCE(SUM(estimated_cost), 0)::float AS total FROM daily_costs WHERE date = CURRENT_DATE',
  );
  const spend = rows[0]?.total ?? 0;
  if (spend > env.AI_DAILY_BUDGET_USD) {
    logger.error({ spend, budget: env.AI_DAILY_BUDGET_USD }, 'AI daily budget exceeded');
    if (env.ALERT_EMAIL) {
      // No transactional-email provider is wired in; surface the alert loudly.
      logger.error(
        { to: env.ALERT_EMAIL, spend },
        `ALERT: RIGHTNOW AI spend $${spend.toFixed(2)} exceeded $${env.AI_DAILY_BUDGET_USD}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Icebreaker generator
// ---------------------------------------------------------------------------
const ICEBREAKER_TTL = 3600;
const FALLBACK_ICEBREAKERS = [
  'You both picked tonight over staying in — what made you go live right now?',
  'No small talk required: what is the best spontaneous night you have had in this city?',
  'You have under an hour. What is worth leaving the house for tonight?',
];

function timeContext(): { timeOfDay: string; dayOfWeek: string } {
  const now = new Date();
  const h = now.getHours();
  const timeOfDay = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late night';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  return { timeOfDay, dayOfWeek };
}

interface IceProfile {
  display_name: string;
  age: number | null;
  preferred_vibes: string[] | null;
  bio: string | null;
  avatar_emoji: string;
  city: string;
}

/** Generate (and cache) a tailored icebreaker for a match. Never throws. */
export async function generateIcebreaker(matchId: string): Promise<string> {
  const fallback =
    FALLBACK_ICEBREAKERS[Math.floor(Math.random() * FALLBACK_ICEBREAKERS.length)] ??
    FALLBACK_ICEBREAKERS[0]!;

  const cacheKey = `icebreaker:${matchId}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return cached;
  if (!isAIConfigured()) return fallback;

  try {
    const matchRes = await pool.query<{
      user1_id: string;
      user2_id: string;
      venue_id: string | null;
    }>('SELECT user1_id, user2_id, venue_id FROM matches WHERE id = $1', [matchId]);
    const match = matchRes.rows[0];
    if (!match) return fallback;

    const profiles = await pool.query<IceProfile & { id: string }>(
      `SELECT id, display_name, age, preferred_vibes, bio, avatar_emoji, city
         FROM profiles WHERE id = ANY($1)`,
      [[match.user1_id, match.user2_id]],
    );
    const u1 = profiles.rows.find((p) => p.id === match.user1_id);
    const u2 = profiles.rows.find((p) => p.id === match.user2_id);

    let venueName = 'a nearby spot';
    if (match.venue_id) {
      const v = await pool.query<{ name: string }>('SELECT name FROM venues WHERE id = $1', [
        match.venue_id,
      ]);
      if (v.rows[0]) venueName = v.rows[0].name;
    }

    const { timeOfDay, dayOfWeek } = timeContext();
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
            'You are a witty dating coach for RIGHTNOW, a spontaneous real-time dating app where ' +
            'people meet in person within the hour. Generate ONE specific casual icebreaker for two ' +
            'people who just matched. Reference their specific shared vibe, the venue, or the ' +
            'spontaneous nature of meeting right now. Maximum 2 sentences. No emojis. Natural and ' +
            'slightly playful. Never generic or cringe.',
        },
        {
          role: 'user',
          content:
            `User 1: ${u1?.display_name ?? 'Someone'}, ${u1?.age ?? '?'}, vibe: ${u1?.preferred_vibes?.[0] ?? 'drinks'}. ` +
            `User 2: ${u2?.display_name ?? 'Someone'}, ${u2?.age ?? '?'}, vibe: ${u2?.preferred_vibes?.[0] ?? 'drinks'}. ` +
            `Meeting at: ${venueName}. Time: ${timeOfDay} on ${dayOfWeek}.`,
        },
      ],
    });
    await logTokenUsage('icebreaker', completion.usage);
    const text = completion.choices[0]?.message?.content?.trim() || fallback;
    await redis.set(cacheKey, text, 'EX', ICEBREAKER_TTL).catch(() => undefined);
    return text;
  } catch (err) {
    logger.warn({ err }, 'icebreaker generation failed; using fallback');
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Profile bio scorer
// ---------------------------------------------------------------------------
const BIO_TTL = 60 * 60 * 24;

export interface BioScore {
  score: number; // 1-10
  suggestion: string;
}

export async function scoreProfileBio(bio: string): Promise<BioScore> {
  const fallback: BioScore = { score: 5, suggestion: 'Add a specific detail about your night.' };
  const hash = crypto.createHash('sha256').update(bio).digest('hex').slice(0, 24);
  const cacheKey = `bioscore:${hash}`;

  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as BioScore;
    } catch {
      // Corrupt cache entry — fall through to regenerate.
    }
  }
  if (!isAIConfigured()) return fallback;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You score dating app bios briefly and helpfully.' },
        {
          role: 'user',
          content:
            'Score this bio 1-10 for authenticity, energy, and conversational hooks. Return only ' +
            'valid JSON with keys score (number) and suggestion (string under 20 words, friendly ' +
            `and specific): ${bio}`,
        },
      ],
    });
    await logTokenUsage('profile-score', completion.usage);
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Partial<BioScore>;
    const result: BioScore = {
      score: typeof parsed.score === 'number' ? Math.max(1, Math.min(10, parsed.score)) : 5,
      suggestion: parsed.suggestion ?? fallback.suggestion,
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', BIO_TTL).catch(() => undefined);
    return result;
  } catch (err) {
    logger.warn({ err }, 'bio scoring failed; using fallback');
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Moderation + GPT safety (used by aiSafety.service)
// ---------------------------------------------------------------------------
export interface ModerationResult {
  flagged: boolean;
  maxCategoryScore: number;
  category: string | null;
}

export async function moderateContent(content: string): Promise<ModerationResult> {
  if (!isAIConfigured()) return { flagged: false, maxCategoryScore: 0, category: null };
  try {
    const moderation = await getOpenAI().moderations.create({
      model: 'omni-moderation-latest',
      input: content,
    });
    const result = moderation.results[0];
    if (!result) return { flagged: false, maxCategoryScore: 0, category: null };
    const entries = Object.entries(result.category_scores) as [string, number][];
    let category: string | null = null;
    let maxCategoryScore = 0;
    for (const [name, score] of entries) {
      if (score > maxCategoryScore) {
        maxCategoryScore = score;
        category = name;
      }
    }
    return { flagged: result.flagged, maxCategoryScore, category };
  } catch (err) {
    logger.warn({ err }, 'moderation failed; treating as clean');
    return { flagged: false, maxCategoryScore: 0, category: null };
  }
}

export interface SafetyAnalysis {
  safe: boolean;
  score: number; // 0 (danger) … 1 (safe)
  concern: string | null;
}

export async function analyzeMessageSafety(content: string): Promise<SafetyAnalysis> {
  const safe: SafetyAnalysis = { safe: true, score: 1, concern: null };
  if (!isAIConfigured()) return safe;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 80,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You analyze dating app pre-meetup messages for safety. Be accurate, not overly sensitive.',
        },
        {
          role: 'user',
          content:
            'Analyze this message for: coercion or pressure to meet, explicit unsolicited content, ' +
            'threats or aggression, requests for personal location before meetup, or harassment. ' +
            'Return only valid JSON: { safe: boolean, score: number from 0 to 1 where 1 is ' +
            `completely safe, concern: string or null }\n\nMessage: ${content}`,
        },
      ],
    });
    await logTokenUsage('chat-safety', completion.usage);
    const parsed = JSON.parse(
      completion.choices[0]?.message?.content ?? '{}',
    ) as Partial<SafetyAnalysis>;
    return {
      safe: parsed.safe ?? true,
      score: typeof parsed.score === 'number' ? parsed.score : 1,
      concern: parsed.concern ?? null,
    };
  } catch (err) {
    logger.warn({ err }, 'GPT safety analysis failed; treating as safe');
    return safe;
  }
}

// ---------------------------------------------------------------------------
// Vision: selfie ↔ profile photo
// ---------------------------------------------------------------------------
export async function comparePhotos(selfieBase64: string, photoUrl: string): Promise<boolean> {
  if (!isAIConfigured()) return false;
  const selfieUrl = selfieBase64.startsWith('data:')
    ? selfieBase64
    : `data:image/jpeg;base64,${selfieBase64}`;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: env.OPENAI_MODEL,
      max_tokens: 10,
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
    await logTokenUsage('photo-match', completion.usage);
    return (completion.choices[0]?.message?.content ?? '').trim().toLowerCase().startsWith('yes');
  } catch (err) {
    logger.warn({ err }, 'photo comparison failed');
    return false;
  }
}

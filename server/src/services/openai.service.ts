import OpenAI from 'openai';
import { env } from '../utils/env.js';

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

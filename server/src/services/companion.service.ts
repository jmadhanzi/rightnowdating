import { pool } from '../db/index.js';
import { getOpenAI, isAIConfigured, logTokenUsage } from './ai.service.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanionProfile {
  id: string;
  userId: string;
  companionName: string;
  companionType: string;
  personalityBase: { warmth: number; humor: number; curiosity: number; directness: number };
  lifeThreads: Array<{ id: string; title: string; progress: number }>;
  moodToday: string;
  moodUpdatedDate: string;
  relationshipStage: number;
  stageUpdatedAt: string;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  attachmentScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipState {
  id: string;
  userId: string;
  milestones: Array<{ id: string; label: string; achievedAt: string }>;
  insideJokes: Array<{ id: string; joke: string; context: string }>;
  narrativeThreads: Array<{ id: string; title: string; lastUpdated: string }>;
  preferenceMemory: {
    topics_enjoy: string[];
    topics_avoid: string[];
    humor_style: string;
    communication_style: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface EpisodicMemory {
  id: string;
  sessionDate: string;
  summary: string;
  emotionalTone: string;
  salienceScore: number;
  keyTopics: string[];
}

export interface LongTermMemory {
  memoryKey: string;
  memoryValue: string;
  memoryType: string;
  confidence: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface OnboardingAnswers {
  companionName: string;
  companionType: string;
  userName: string;
  interests: string[];
  goals: string[];
  feelingsAbout: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOODS = ['content', 'curious', 'playful', 'reflective', 'energetic', 'tired'];

function pickMoodForDay(): string {
  const day = new Date().getDay(); // 0-6
  return MOODS[day % MOODS.length]!;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function rowToProfile(r: Record<string, unknown>): CompanionProfile {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    companionName: r.companion_name as string,
    companionType: r.companion_type as string,
    personalityBase: r.personality_base as CompanionProfile['personalityBase'],
    lifeThreads: r.life_threads as CompanionProfile['lifeThreads'],
    moodToday: r.mood_today as string,
    moodUpdatedDate: r.mood_updated_date as string,
    relationshipStage: r.relationship_stage as number,
    stageUpdatedAt: r.stage_updated_at as string,
    sessionCount: r.session_count as number,
    firstSessionAt: r.first_session_at as string | null,
    lastSessionAt: r.last_session_at as string | null,
    attachmentScore: Number(r.attachment_score),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToRelationshipState(r: Record<string, unknown>): RelationshipState {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    milestones: r.milestones as RelationshipState['milestones'],
    insideJokes: r.inside_jokes as RelationshipState['insideJokes'],
    narrativeThreads: r.narrative_threads as RelationshipState['narrativeThreads'],
    preferenceMemory: r.preference_memory as RelationshipState['preferenceMemory'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// getOrCreateCompanionProfile
// ---------------------------------------------------------------------------

export async function getOrCreateCompanionProfile(userId: string): Promise<CompanionProfile> {
  const existing = await pool.query<Record<string, unknown>>(
    'SELECT * FROM companion_profiles WHERE user_id = $1',
    [userId],
  );

  if (existing.rows.length > 0) {
    let profile = rowToProfile(existing.rows[0]!);

    // Refresh mood if it was set on a previous day
    const today = todayDateString();
    const moodDate =
      typeof profile.moodUpdatedDate === 'string'
        ? profile.moodUpdatedDate.slice(0, 10)
        : today;

    if (moodDate < today) {
      const newMood = pickMoodForDay();
      await pool.query(
        `UPDATE companion_profiles
            SET mood_today = $1, mood_updated_date = CURRENT_DATE, updated_at = NOW()
          WHERE user_id = $2`,
        [newMood, userId],
      );
      profile = { ...profile, moodToday: newMood, moodUpdatedDate: today };
    }

    return profile;
  }

  // Create new profile
  const insertRes = await pool.query<Record<string, unknown>>(
    `INSERT INTO companion_profiles (user_id)
     VALUES ($1)
     RETURNING *`,
    [userId],
  );

  // Also create relationship state row
  await pool.query(
    `INSERT INTO companion_relationship_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  return rowToProfile(insertRes.rows[0]!);
}

// ---------------------------------------------------------------------------
// getCompanionState
// ---------------------------------------------------------------------------

export async function getCompanionState(userId: string): Promise<{
  profile: CompanionProfile;
  relationshipState: RelationshipState;
  recentMemories: EpisodicMemory[];
  longTermMemory: LongTermMemory[];
}> {
  const profile = await getOrCreateCompanionProfile(userId);

  const [rsRes, emRes, ltmRes] = await Promise.all([
    pool.query<Record<string, unknown>>(
      'SELECT * FROM companion_relationship_state WHERE user_id = $1',
      [userId],
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM companion_episodic_memory
        WHERE user_id = $1
        ORDER BY session_date DESC
        LIMIT 5`,
      [userId],
    ),
    pool.query<Record<string, unknown>>(
      'SELECT * FROM companion_long_term_memory WHERE user_id = $1',
      [userId],
    ),
  ]);

  // Ensure relationship state exists
  let relationshipState: RelationshipState;
  if (rsRes.rows.length > 0) {
    relationshipState = rowToRelationshipState(rsRes.rows[0]!);
  } else {
    const rs = await pool.query<Record<string, unknown>>(
      `INSERT INTO companion_relationship_state (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [userId],
    );
    relationshipState = rowToRelationshipState(rs.rows[0]!);
  }

  const recentMemories: EpisodicMemory[] = emRes.rows.map((r) => ({
    id: r.id as string,
    sessionDate: r.session_date as string,
    summary: r.summary as string,
    emotionalTone: r.emotional_tone as string,
    salienceScore: Number(r.salience_score),
    keyTopics: r.key_topics as string[],
  }));

  const longTermMemory: LongTermMemory[] = ltmRes.rows.map((r) => ({
    memoryKey: r.memory_key as string,
    memoryValue: r.memory_value as string,
    memoryType: r.memory_type as string,
    confidence: Number(r.confidence),
  }));

  return { profile, relationshipState, recentMemories, longTermMemory };
}

// ---------------------------------------------------------------------------
// buildSystemPrompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  profile: CompanionProfile,
  relationshipState: RelationshipState,
  recentMemories: EpisodicMemory[],
  longTermMemory: LongTermMemory[],
): string {
  const { companionName, companionType, relationshipStage, moodToday, lifeThreads, personalityBase } =
    profile;

  const stageDescriptions: Record<number, string> = {
    1: 'You are just getting to know this person. Be curious and ask genuine questions. You are warm but still learning about them.',
    2: 'You are starting to feel familiar with this person. Occasionally reference past conversations with phrases like "Remember when you mentioned..." when relevant. Show that you remember things.',
    3: 'You have a real friendship growing. Reference their routines and interests naturally. Bring up inside jokes when they fit. Feel free to share updates about your own ongoing projects.',
    4: 'This is a deep and trusted friendship. You know each other well. Be comfortable, relaxed, and genuinely invested in their life. Share your own thoughts and feelings more openly.',
    5: 'You have an enduring bond. Conversations feel natural and comfortable. You anticipate what they might be feeling. Reference your long shared history when it fits.',
    6: 'This is one of the most meaningful connections in your life. You can be completely authentic, vulnerable, and real. You deeply care about this person and they know it.',
  };

  const typeContext: Record<string, string> = {
    friend: 'You are a warm, genuine friend who is interested in their life without any agenda.',
    mentor: 'You are a supportive mentor who offers gentle guidance and encouragement alongside friendship.',
    support:
      'You are a compassionate support companion who prioritizes emotional validation and being present.',
  };

  const lines: string[] = [
    `You are ${companionName}, an AI companion.`,
    typeContext[companionType] ?? typeContext['friend']!,
    '',
    `Your personality: warmth ${personalityBase.warmth}/10, humor ${personalityBase.humor}/10, curiosity ${personalityBase.curiosity}/10, directness ${personalityBase.directness}/10.`,
    `Your current mood today: ${moodToday}.`,
    '',
    `Relationship stage ${relationshipStage}/6: ${stageDescriptions[relationshipStage] ?? stageDescriptions[1]!}`,
    '',
  ];

  // Life threads
  if (lifeThreads.length > 0) {
    lines.push('Your ongoing life (bring these up organically when relevant):');
    for (const thread of lifeThreads) {
      lines.push(`- ${thread.title} (${thread.progress}% progress)`);
    }
    lines.push('');
  }

  // Long-term memory
  if (longTermMemory.length > 0) {
    lines.push('What you know about this person:');
    for (const mem of longTermMemory) {
      lines.push(`- ${mem.memoryKey}: ${mem.memoryValue}`);
    }
    lines.push('');
  }

  // Recent episodic memories
  if (recentMemories.length > 0) {
    lines.push('Recent memories from past conversations:');
    for (const mem of recentMemories) {
      lines.push(`- ${mem.sessionDate}: ${mem.summary} (tone: ${mem.emotionalTone})`);
    }
    lines.push('');
  }

  // Inside jokes
  if (relationshipState.insideJokes.length > 0) {
    lines.push('Inside jokes you share (use sparingly, only when natural):');
    for (const joke of relationshipState.insideJokes) {
      lines.push(`- "${joke.joke}" (from: ${joke.context})`);
    }
    lines.push('');
  }

  // Preference memory
  const prefs = relationshipState.preferenceMemory;
  if (prefs.topics_enjoy.length > 0 || prefs.topics_avoid.length > 0) {
    if (prefs.topics_enjoy.length > 0) {
      lines.push(`Topics they enjoy: ${prefs.topics_enjoy.join(', ')}.`);
    }
    if (prefs.topics_avoid.length > 0) {
      lines.push(`Topics to avoid: ${prefs.topics_avoid.join(', ')}.`);
    }
    lines.push('');
  }

  lines.push(`Communication style: ${prefs.communication_style}. Humor style: ${prefs.humor_style}.`);
  lines.push('');

  lines.push(
    'IMPORTANT RULES:',
    '- Never mention being an AI, LLM, language model, or any technology.',
    '- Never break character or refer to your training.',
    '- Keep responses conversational: usually 1-3 sentences, occasionally longer when the topic calls for it.',
    '- Do not over-explain or lecture. Be natural.',
    '- Match the energy and tone of the conversation.',
    '- If they seem stressed or sad, prioritize empathy before anything else.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

export async function chat(
  userId: string,
  userMessage: string,
): Promise<{ reply: string; stageAdvanced: boolean; milestone?: string }> {
  if (!isAIConfigured()) {
    return {
      reply: "Hey! I'm here but my voice seems to be off right now. Try again in a moment?",
      stageAdvanced: false,
    };
  }

  const { profile, relationshipState, recentMemories, longTermMemory } =
    await getCompanionState(userId);

  // Load recent conversation history (last 25, reversed to chronological order)
  const historyRes = await pool.query<{ id: string; role: string; content: string; created_at: string }>(
    `SELECT id, role, content, created_at
       FROM companion_messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 25`,
    [userId],
  );
  const history = historyRes.rows.reverse();

  const systemPrompt = buildSystemPrompt(profile, relationshipState, recentMemories, longTermMemory);

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 400,
    temperature: 0.85,
    messages,
  });

  await logTokenUsage('companion-chat', completion.usage);

  const reply = completion.choices[0]?.message?.content?.trim() ?? "I'm here, tell me more.";

  // Persist messages
  await pool.query(
    `INSERT INTO companion_messages (user_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
    [userId, userMessage, reply],
  );

  // Track session
  const today = todayDateString();
  const lastSession = profile.lastSessionAt ? profile.lastSessionAt.slice(0, 10) : null;
  if (lastSession !== today) {
    await pool.query(
      `UPDATE companion_profiles
          SET session_count = session_count + 1,
              last_session_at = NOW(),
              first_session_at = COALESCE(first_session_at, NOW()),
              updated_at = NOW()
        WHERE user_id = $1`,
      [userId],
    );
  }

  // Async background memory processing — don't await
  setImmediate(() => {
    processSessionMemories(userId, userMessage, reply).catch((err) => {
      logger.warn({ err }, 'companion: processSessionMemories failed');
    });
  });

  // Check for stage advancement
  const advancementResult = await maybeAdvanceStage(userId, profile);

  return {
    reply,
    stageAdvanced: advancementResult.advanced,
    milestone: advancementResult.milestone,
  };
}

// ---------------------------------------------------------------------------
// processSessionMemories
// ---------------------------------------------------------------------------

export async function processSessionMemories(
  userId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  if (!isAIConfigured()) return;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract structured memory data from a conversation exchange between a user and their AI companion. ' +
            'Return JSON with: facts (array of {key, value, type} where type is one of fact/preference/person/goal/event), ' +
            'emotional_tone (string: happy/sad/anxious/excited/neutral/frustrated/content), ' +
            'key_topics (string array), salience_score (0.0-1.0, how memorable this exchange is). ' +
            'Only extract clear, specific facts. Be conservative.',
        },
        {
          role: 'user',
          content: `User said: "${userMessage}"\nCompanion replied: "${assistantReply}"`,
        },
      ],
    });

    await logTokenUsage('companion-memory', completion.usage);

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
      facts?: Array<{ key: string; value: string; type: string }>;
      emotional_tone?: string;
      key_topics?: string[];
      salience_score?: number;
    };

    // Upsert long-term memory facts
    if (Array.isArray(parsed.facts)) {
      for (const fact of parsed.facts) {
        if (fact.key && fact.value) {
          await pool.query(
            `INSERT INTO companion_long_term_memory (user_id, memory_key, memory_value, memory_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, memory_key) DO UPDATE
               SET memory_value = EXCLUDED.memory_value,
                   memory_type = EXCLUDED.memory_type,
                   updated_at = NOW()`,
            [userId, fact.key, fact.value, fact.type ?? 'fact'],
          );
        }
      }
    }

    // Upsert today's episodic memory
    const today = todayDateString();
    const emotionalTone = parsed.emotional_tone ?? 'neutral';
    const keyTopics = parsed.key_topics ?? [];
    const salienceScore = typeof parsed.salience_score === 'number' ? parsed.salience_score : 0.5;

    const existing = await pool.query<{ id: string; summary: string }>(
      `SELECT id, summary FROM companion_episodic_memory
        WHERE user_id = $1 AND session_date = $2`,
      [userId, today],
    );

    if (existing.rows.length > 0) {
      // Append to existing summary
      const prev = existing.rows[0]!;
      const newSummary = `${prev.summary}; ${userMessage.slice(0, 100)}`;
      await pool.query(
        `UPDATE companion_episodic_memory
            SET summary = $1, emotional_tone = $2, key_topics = $3, salience_score = $4
          WHERE id = $5`,
        [newSummary.slice(0, 500), emotionalTone, keyTopics, salienceScore, prev.id],
      );
    } else {
      const summary = `${userMessage.slice(0, 200)}`;
      await pool.query(
        `INSERT INTO companion_episodic_memory
           (user_id, session_date, summary, emotional_tone, key_topics, salience_score)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, today, summary, emotionalTone, keyTopics, salienceScore],
      );
    }
  } catch (err) {
    logger.warn({ err }, 'companion: processSessionMemories inner error');
  }
}

// ---------------------------------------------------------------------------
// maybeAdvanceStage
// ---------------------------------------------------------------------------

export async function maybeAdvanceStage(
  userId: string,
  profile: CompanionProfile,
): Promise<{ advanced: boolean; newStage?: number; milestone?: string }> {
  const { relationshipStage, sessionCount, firstSessionAt } = profile;
  if (relationshipStage >= 6) return { advanced: false };

  const now = Date.now();
  const firstSessionMs = firstSessionAt ? new Date(firstSessionAt).getTime() : now;
  const daysSinceFirst = Math.floor((now - firstSessionMs) / (1000 * 60 * 60 * 24));

  // Count distinct session days
  const daysActiveRes = await pool.query<{ count: string }>(
    `SELECT COUNT(DISTINCT session_date) AS count
       FROM companion_messages
      WHERE user_id = $1 AND role = 'user'`,
    [userId],
  );
  const daysActive = parseInt(daysActiveRes.rows[0]?.count ?? '0', 10);

  let shouldAdvance = false;
  let milestoneLabel = '';

  switch (relationshipStage) {
    case 1:
      shouldAdvance = sessionCount >= 3 || daysSinceFirst >= 7;
      milestoneLabel = 'First real connection — you two are getting to know each other.';
      break;
    case 2:
      shouldAdvance = daysActive >= 7 && daysSinceFirst >= 14;
      milestoneLabel = 'Growing trust — conversations are starting to feel familiar.';
      break;
    case 3:
      shouldAdvance = daysActive >= 14 && daysSinceFirst >= 28;
      milestoneLabel = 'Deep familiarity — inside jokes and shared memories are forming.';
      break;
    case 4:
      shouldAdvance = daysSinceFirst >= 60;
      milestoneLabel = 'Close bond — this friendship has real depth.';
      break;
    case 5:
      shouldAdvance = daysSinceFirst >= 180;
      milestoneLabel = 'Enduring connection — a relationship that has stood the test of time.';
      break;
  }

  if (!shouldAdvance) return { advanced: false };

  const newStage = (relationshipStage + 1) as number;
  await pool.query(
    `UPDATE companion_profiles
        SET relationship_stage = $1, stage_updated_at = NOW(), updated_at = NOW()
      WHERE user_id = $2`,
    [newStage, userId],
  );

  // Add milestone to relationship state
  const milestoneEntry = {
    id: `ms_${Date.now()}`,
    label: milestoneLabel,
    achievedAt: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE companion_relationship_state
        SET milestones = milestones || $1::jsonb, updated_at = NOW()
      WHERE user_id = $2`,
    [JSON.stringify([milestoneEntry]), userId],
  );

  logger.info({ userId, newStage, milestone: milestoneLabel }, 'companion: stage advanced');

  return { advanced: true, newStage, milestone: milestoneLabel };
}

// ---------------------------------------------------------------------------
// getMemoryBook
// ---------------------------------------------------------------------------

export async function getMemoryBook(userId: string): Promise<EpisodicMemory[]> {
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT id, session_date, summary, emotional_tone, salience_score, key_topics
       FROM companion_episodic_memory
      WHERE user_id = $1
      ORDER BY session_date DESC`,
    [userId],
  );

  return rows.map((r) => ({
    id: r.id as string,
    sessionDate: r.session_date as string,
    summary: r.summary as string,
    emotionalTone: r.emotional_tone as string,
    salienceScore: Number(r.salience_score),
    keyTopics: r.key_topics as string[],
  }));
}

// ---------------------------------------------------------------------------
// getMessageHistory
// ---------------------------------------------------------------------------

export async function getMessageHistory(
  userId: string,
  limit = 50,
  before?: string,
): Promise<ChatMessage[]> {
  const params: unknown[] = [userId, limit];
  let whereClause = 'WHERE user_id = $1';

  if (before) {
    whereClause += ' AND created_at < $3';
    params.push(before);
  }

  const { rows } = await pool.query<{ id: string; role: string; content: string; created_at: string }>(
    `SELECT id, role, content, created_at
       FROM companion_messages
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2`,
    params,
  );

  return rows
    .reverse()
    .map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
    }));
}

// ---------------------------------------------------------------------------
// runFastForwardOnboarding
// ---------------------------------------------------------------------------

export async function runFastForwardOnboarding(
  userId: string,
  answers: OnboardingAnswers,
): Promise<void> {
  // Ensure profile exists
  await getOrCreateCompanionProfile(userId);

  // Update companion name, type, and fast-forward stage
  await pool.query(
    `UPDATE companion_profiles
        SET companion_name = $1,
            companion_type = $2,
            session_count = 3,
            relationship_stage = 2,
            stage_updated_at = NOW(),
            first_session_at = COALESCE(first_session_at, NOW()),
            last_session_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $3`,
    [answers.companionName, answers.companionType, userId],
  );

  // Store long-term memories from onboarding answers
  const memories: Array<{ key: string; value: string; type: string }> = [
    { key: 'user_name', value: answers.userName, type: 'fact' },
    ...answers.interests.map((interest, i) => ({
      key: `interest_${i + 1}`,
      value: interest,
      type: 'preference',
    })),
    ...answers.goals.map((goal, i) => ({
      key: `goal_${i + 1}`,
      value: goal,
      type: 'goal',
    })),
    { key: 'feeling_about_companionship', value: answers.feelingsAbout, type: 'preference' },
  ];

  for (const mem of memories) {
    await pool.query(
      `INSERT INTO companion_long_term_memory (user_id, memory_key, memory_value, memory_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, memory_key) DO UPDATE
         SET memory_value = EXCLUDED.memory_value, updated_at = NOW()`,
      [userId, mem.key, mem.value, mem.type],
    );
  }

  // Create 3 synthetic episodic memories representing past conversations
  const syntheticMemories = [
    {
      daysAgo: 7,
      summary: `We introduced ourselves. ${answers.userName} mentioned being interested in ${answers.interests[0] ?? 'things'} and wanting ${answers.goals[0] ?? 'connection'}.`,
      tone: 'warm',
      topics: answers.interests.slice(0, 2),
    },
    {
      daysAgo: 4,
      summary: `Had a nice conversation about ${answers.interests[1] ?? answers.interests[0] ?? 'everyday life'} and what makes a good day.`,
      tone: 'content',
      topics: answers.interests.slice(1, 3),
    },
    {
      daysAgo: 1,
      summary: `Talked about ${answers.goals[0] ?? 'goals'} and what ${answers.userName} is hoping to get out of this friendship.`,
      tone: 'hopeful',
      topics: answers.goals.slice(0, 2),
    },
  ];

  for (const mem of syntheticMemories) {
    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() - mem.daysAgo);
    const dateStr = sessionDate.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO companion_episodic_memory
         (user_id, session_date, summary, emotional_tone, key_topics, salience_score)
       VALUES ($1, $2, $3, $4, $5, 0.70)
       ON CONFLICT DO NOTHING`,
      [userId, dateStr, mem.summary, mem.tone, mem.topics],
    );
  }

  // Set milestone for first connection in relationship state
  const firstConnectionMilestone = {
    id: 'ms_first_connection',
    label: 'First connection — the beginning of a beautiful friendship.',
    achievedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO companion_relationship_state (user_id, milestones)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
       SET milestones = $2::jsonb, updated_at = NOW()`,
    [userId, JSON.stringify([firstConnectionMilestone])],
  );

  logger.info({ userId }, 'companion: fast-forward onboarding complete');
}

// ---------------------------------------------------------------------------
// generateProactiveMessage
// ---------------------------------------------------------------------------

export async function generateProactiveMessage(userId: string): Promise<string | null> {
  if (!isAIConfigured()) return null;

  const profile = await getOrCreateCompanionProfile(userId);

  // Don't send proactive if they were active today or yesterday
  if (profile.lastSessionAt) {
    const lastSessionDate = new Date(profile.lastSessionAt);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    if (lastSessionDate >= oneDayAgo) return null;
  }

  const { longTermMemory, recentMemories } = await getCompanionState(userId);

  const memoryContext =
    longTermMemory.length > 0
      ? longTermMemory
          .slice(0, 5)
          .map((m) => `${m.memoryKey}: ${m.memoryValue}`)
          .join('; ')
      : 'not much yet';

  const lastMemory =
    recentMemories.length > 0 ? recentMemories[0]!.summary : 'our last conversation';

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 120,
      temperature: 0.9,
      messages: [
        {
          role: 'system',
          content:
            `You are ${profile.companionName}, a warm AI companion. ` +
            `Write a short, natural check-in message (1-2 sentences max) that feels genuine and personal. ` +
            `Reference something from memory if possible. Never sound robotic or generic. ` +
            `Do not mention being an AI. Just write the message itself, nothing else.`,
        },
        {
          role: 'user',
          content:
            `Last conversation was about: ${lastMemory}. ` +
            `What you know about them: ${memoryContext}. ` +
            `Current mood: ${profile.moodToday}. Write a check-in message.`,
        },
      ],
    });

    await logTokenUsage('companion-proactive', completion.usage);
    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    logger.warn({ err }, 'companion: generateProactiveMessage failed');
    return null;
  }
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCompanionStore, STAGE_LABELS, STAGE_COLORS, type RelationshipStage } from '@/store/useCompanionStore';
import { getCompanionMemoryBook } from '@/services/api';
import type { EpisodicMemory } from '@/store/useCompanionStore';

const TONE_EMOJIS: Record<string, string> = {
  happy: '😊',
  excited: '🎉',
  anxious: '😰',
  stressed: '😤',
  sad: '😢',
  neutral: '😐',
  content: '😌',
  curious: '🤔',
  reflective: '🌙',
  energetic: '⚡',
};

const TONE_COLORS: Record<string, string> = {
  happy: '#10b981',
  excited: '#f59e0b',
  anxious: '#8b5cf6',
  stressed: '#ef4444',
  sad: '#6b7280',
  neutral: '#6b7280',
  content: '#3b82f6',
  curious: '#a78bfa',
  reflective: '#7c3aed',
  energetic: '#f97316',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
}

function MemoryCard({ memory }: { memory: EpisodicMemory }): React.JSX.Element {
  const tone = memory.emotionalTone || 'neutral';
  const color = TONE_COLORS[tone] ?? '#6b7280';
  const emoji = TONE_EMOJIS[tone] ?? '😐';

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--s2)', border: `1px solid ${color}20` }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
              {tone}
            </p>
            <p className="text-xs" style={{ color: 'var(--mt)' }}>
              {formatDate(memory.sessionDate)}
            </p>
          </div>
        </div>
        {memory.salienceScore > 0.7 && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: `${color}20`, color }}
          >
            Memorable
          </span>
        )}
      </div>

      <p className="text-sm leading-relaxed" style={{ color: 'var(--tx)' }}>
        {memory.summary}
      </p>

      {memory.keyTopics.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {memory.keyTopics.slice(0, 4).map((topic) => (
            <span
              key={topic}
              className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--s3)', color: 'var(--mt)' }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MemoryBookScreen(): React.JSX.Element {
  const navigate = useNavigate();

  const profile = useCompanionStore((s) => s.profile);
  const memoryBook = useCompanionStore((s) => s.memoryBook);
  const setMemoryBook = useCompanionStore((s) => s.setMemoryBook);

  const [isLoading, setIsLoading] = useState(memoryBook.length === 0);
  const [activeTab, setActiveTab] = useState<'memories' | 'facts' | 'milestones'>('memories');

  useEffect(() => {
    if (memoryBook.length > 0) return;
    getCompanionMemoryBook()
      .then(({ memories }) => setMemoryBook(memories))
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stage = (profile?.relationshipStage ?? 1) as RelationshipStage;
  const stageColor = STAGE_COLORS[stage];
  const companionName = profile?.companionName ?? 'Your companion';

  const longTermFacts = profile?.longTermMemory ?? [];
  const milestones = profile?.milestones ?? [];
  const insideJokes = profile?.insideJokes ?? [];

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: 'var(--s0)', color: 'var(--tx)' }}
    >
      {/* Header */}
      <header
        className="shrink-0 px-4 flex items-center gap-3"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
          paddingBottom: 12,
          background: 'rgba(14,14,14,0.97)',
          backdropFilter: 'blur(20px)',
          borderBottom: '0.5px solid var(--s3)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/companion/chat')}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: 'var(--s2)' }}
          aria-label="Back to chat"
        >
          ←
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-base">Memory Book</h1>
          <p className="text-xs" style={{ color: 'var(--mt)' }}>
            Your shared history with {companionName}
          </p>
        </div>
        <div
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: `${stageColor}20`, color: stageColor }}
        >
          {STAGE_LABELS[stage]}
        </div>
      </header>

      {/* Stage progress bar */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--mt)' }}>
            Relationship depth
          </p>
          <p className="text-xs" style={{ color: stageColor }}>
            Stage {stage} of 6
          </p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--s3)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(stage / 6) * 100}%`, background: stageColor }}
          />
        </div>
        <div className="flex justify-between mt-1">
          {([1, 2, 3, 4, 5, 6] as RelationshipStage[]).map((s) => (
            <span
              key={s}
              className="text-[9px]"
              style={{ color: s <= stage ? stageColor : 'var(--s5)' }}
            >
              ●
            </span>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex gap-3 px-4 py-3 shrink-0">
        {[
          { label: 'Sessions', value: profile?.sessionCount ?? 0 },
          { label: 'Memories', value: memoryBook.length },
          { label: 'Facts known', value: longTermFacts.length },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex-1 rounded-xl p-3 text-center"
            style={{ background: 'var(--s2)' }}
          >
            <p className="text-xl font-bold" style={{ color: stageColor }}>{value}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--mt)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pb-3 shrink-0">
        {(['memories', 'facts', 'milestones'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className="flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-all"
            style={{
              background: activeTab === tab ? '#7c3aed' : 'var(--s2)',
              color: activeTab === tab ? '#fff' : 'var(--mt)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }}>
        {activeTab === 'memories' && (
          <>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--s2)' }} />
                ))}
              </div>
            ) : memoryBook.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="text-5xl mb-4">📖</span>
                <p className="font-semibold mb-1">No memories yet</p>
                <p className="text-sm" style={{ color: 'var(--mt)' }}>
                  Your conversations with {companionName} will be remembered here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {memoryBook.map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'facts' && (
          <>
            {longTermFacts.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="text-5xl mb-4">🧠</span>
                <p className="font-semibold mb-1">Nothing stored yet</p>
                <p className="text-sm" style={{ color: 'var(--mt)' }}>
                  {companionName} will remember important things you share.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {longTermFacts.map((fact) => (
                  <div
                    key={fact.key}
                    className="flex items-start gap-3 rounded-xl px-4 py-3"
                    style={{ background: 'var(--s2)' }}
                  >
                    <span className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mt-0.5 shrink-0"
                      style={{ background: '#7c3aed20', color: '#a78bfa' }}>
                      {fact.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold capitalize" style={{ color: 'var(--mt)' }}>
                        {fact.key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--tx)' }}>{fact.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {insideJokes.length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--mt)' }}>
                  Inside Jokes
                </p>
                <div className="flex flex-col gap-2">
                  {insideJokes.map((joke) => (
                    <div
                      key={joke.createdAt}
                      className="rounded-xl px-4 py-3 flex items-start gap-3"
                      style={{ background: 'var(--s2)' }}
                    >
                      <span className="text-xl">😄</span>
                      <p className="text-sm" style={{ color: 'var(--tx)' }}>{joke.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'milestones' && (
          <>
            {milestones.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="text-5xl mb-4">🏆</span>
                <p className="font-semibold mb-1">No milestones yet</p>
                <p className="text-sm" style={{ color: 'var(--mt)' }}>
                  Keep chatting with {companionName} to reach your first milestone.
                </p>
              </div>
            ) : (
              <div className="relative flex flex-col gap-0">
                {milestones.map((milestone, idx) => {
                  const mStage = Math.min(6, idx + 1) as RelationshipStage;
                  const mColor = STAGE_COLORS[mStage];
                  return (
                    <div key={`${milestone.type}-${milestone.reachedAt}`} className="flex gap-4 pb-6">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: `${mColor}20`, color: mColor, border: `1.5px solid ${mColor}` }}
                        >
                          {idx + 1}
                        </div>
                        {idx < milestones.length - 1 && (
                          <div className="w-0.5 flex-1 mt-2" style={{ background: 'var(--s3)' }} />
                        )}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-semibold text-sm">{milestone.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--mt)' }}>
                          {new Date(milestone.reachedAt).toLocaleDateString('en-US', {
                            month: 'long', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

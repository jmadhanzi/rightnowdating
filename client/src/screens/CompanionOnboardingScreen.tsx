import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '@/components/Button';
import { useToast } from '@/hooks/useToast';
import { useCompanionStore } from '@/store/useCompanionStore';
import { runCompanionOnboarding, type OnboardingAnswers } from '@/services/api';

type Step = 'welcome' | 'companion-type' | 'companion-name' | 'about-you' | 'interests' | 'fastforward' | 'done';

const COMPANION_TYPES = [
  { key: 'friend', label: 'Best Friend', desc: 'Someone to talk to, laugh with, and share your day', emoji: '🤝' },
  { key: 'mentor', label: 'Mentor', desc: 'Thoughtful guidance, accountability, and growth support', emoji: '🌱' },
  { key: 'support', label: 'Support Buddy', desc: 'Emotional support, empathy, and a safe space to vent', emoji: '💜' },
] as const;

const INTEREST_OPTIONS = [
  'Fitness & Health', 'Travel', 'Cooking', 'Music', 'Reading', 'Gaming',
  'Art & Creativity', 'Tech', 'Movies & TV', 'Nature', 'Fashion', 'Career',
];

const GOAL_OPTIONS = [
  'Be more social', 'Reduce stress', 'Build confidence', 'Stay accountable',
  'Process emotions', 'Explore new ideas', 'Have someone to talk to',
];

const FAST_FORWARD_SCENES = [
  'First chat — getting to know each other...',
  'Sharing your favourite childhood memory...',
  'Laughing about something ridiculous...',
  'Your companion remembers your coffee order...',
  'A real connection is forming...',
];

export default function CompanionOnboardingScreen(): React.JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const setProfile = useCompanionStore((s) => s.setProfile);

  const [step, setStep] = useState<Step>('welcome');
  const [companionType, setCompanionType] = useState<'friend' | 'mentor' | 'support'>('friend');
  const [companionName, setCompanionName] = useState('');
  const [userName, setUserName] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [ffScene, setFfScene] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const toggleInterest = (item: string) =>
    setSelectedInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
    );

  const toggleGoal = (item: string) =>
    setSelectedGoals((prev) =>
      prev.includes(item) ? prev.filter((g) => g !== item) : [...prev, item],
    );

  const startFastForward = async () => {
    if (!companionName.trim() || !userName.trim()) return;
    setStep('fastforward');

    // Animate fast-forward scenes
    for (let i = 0; i < FAST_FORWARD_SCENES.length; i++) {
      await new Promise((r) => setTimeout(r, 900));
      setFfScene(i);
    }

    await new Promise((r) => setTimeout(r, 600));

    const answers: OnboardingAnswers = {
      companionName: companionName.trim() || 'Alex',
      companionType,
      userName: userName.trim(),
      interests: selectedInterests,
      goals: selectedGoals,
      feelingsAbout: selectedGoals[0] ?? 'having someone to talk to',
    };

    setIsLoading(true);
    try {
      const profile = await runCompanionOnboarding(answers);
      setProfile(profile);
      setStep('done');
      await new Promise((r) => setTimeout(r, 1200));
      navigate('/companion/chat', { replace: true });
    } catch {
      toast.error('Something went wrong — please try again');
      setStep('interests');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step: Welcome ──────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
        <div className="text-6xl mb-6">🔮</div>
        <h1 className="text-3xl font-bold mb-3 font-display" style={{ color: '#a78bfa' }}>
          Meet EchoBond
        </h1>
        <p className="text-base mb-2" style={{ color: 'var(--mt)' }}>
          An AI companion that actually remembers you.
        </p>
        <p className="text-sm mb-10 max-w-sm" style={{ color: 'var(--mt)' }}>
          Unlike anything else — the longer you talk, the deeper the connection. Your companion
          builds a real shared history with you.
        </p>
        <Button onClick={() => setStep('companion-type')} style={{ background: '#7c3aed', color: '#fff', width: '100%', maxWidth: 320 }}>
          Get Started
        </Button>
      </div>
    );
  }

  // ── Step: Companion Type ───────────────────────────────────────────────────
  if (step === 'companion-type') {
    return (
      <div className="flex min-h-screen flex-col px-5 pt-14 pb-8" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
        <h2 className="text-2xl font-bold mb-2">What kind of companion do you need?</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--mt)' }}>You can change this later.</p>
        <div className="flex flex-col gap-3 flex-1">
          {COMPANION_TYPES.map((ct) => (
            <button
              key={ct.key}
              type="button"
              onClick={() => setCompanionType(ct.key)}
              className="flex items-start gap-4 rounded-2xl p-4 text-left transition-all"
              style={{
                background: companionType === ct.key ? '#4c1d9520' : 'var(--s2)',
                border: companionType === ct.key ? '1.5px solid #7c3aed' : '1.5px solid var(--s3)',
              }}
            >
              <span className="text-3xl mt-0.5">{ct.emoji}</span>
              <div>
                <p className="font-semibold">{ct.label}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--mt)' }}>{ct.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <Button
          onClick={() => setStep('companion-name')}
          style={{ background: '#7c3aed', color: '#fff', marginTop: 24 }}
        >
          Continue
        </Button>
      </div>
    );
  }

  // ── Step: Companion Name ───────────────────────────────────────────────────
  if (step === 'companion-name') {
    return (
      <div className="flex min-h-screen flex-col px-5 pt-14 pb-8" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
        <h2 className="text-2xl font-bold mb-2">Name your companion</h2>
        <p className="text-sm mb-8" style={{ color: 'var(--mt)' }}>
          Give them a name that feels right to you.
        </p>
        <input
          type="text"
          placeholder="e.g. Alex, Sam, Jordan..."
          maxLength={24}
          value={companionName}
          onChange={(e) => setCompanionName(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base outline-none focus:ring-2"
          style={{
            background: 'var(--s2)',
            border: '1.5px solid var(--s4)',
            color: 'var(--tx)',
            boxShadow: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--s4)')}
        />
        <p className="text-sm mt-8 mb-2" style={{ color: 'var(--mt)' }}>And what should they call you?</p>
        <input
          type="text"
          placeholder="Your first name"
          maxLength={32}
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-base outline-none"
          style={{
            background: 'var(--s2)',
            border: '1.5px solid var(--s4)',
            color: 'var(--tx)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--s4)')}
        />
        <div className="flex-1" />
        <Button
          onClick={() => setStep('interests')}
          disabled={!companionName.trim() || !userName.trim()}
          style={{ background: '#7c3aed', color: '#fff', marginTop: 24 }}
        >
          Continue
        </Button>
      </div>
    );
  }

  // ── Step: Interests ────────────────────────────────────────────────────────
  if (step === 'interests') {
    return (
      <div className="flex min-h-screen flex-col px-5 pt-14 pb-8" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
        <h2 className="text-2xl font-bold mb-1">What are you into?</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--mt)' }}>
          Pick as many as you like. {companionName || 'Your companion'} will remember these.
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {INTEREST_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleInterest(item)}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
              style={{
                background: selectedInterests.includes(item) ? '#7c3aed' : 'var(--s2)',
                color: selectedInterests.includes(item) ? '#fff' : 'var(--mt)',
                border: `1px solid ${selectedInterests.includes(item) ? '#7c3aed' : 'var(--s4)'}`,
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <h3 className="font-semibold mb-2">What are you hoping for?</h3>
        <div className="flex flex-wrap gap-2 mb-8">
          {GOAL_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => toggleGoal(item)}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-all"
              style={{
                background: selectedGoals.includes(item) ? '#7c3aed' : 'var(--s2)',
                color: selectedGoals.includes(item) ? '#fff' : 'var(--mt)',
                border: `1px solid ${selectedGoals.includes(item) ? '#7c3aed' : 'var(--s4)'}`,
              }}
            >
              {item}
            </button>
          ))}
        </div>
        <Button
          onClick={startFastForward}
          disabled={isLoading}
          style={{ background: '#7c3aed', color: '#fff' }}
        >
          Meet {companionName || 'your companion'}
        </Button>
      </div>
    );
  }

  // ── Step: Fast-Forward ─────────────────────────────────────────────────────
  if (step === 'fastforward') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
        <div className="mb-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)' }}
          >
            {companionName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: '#a78bfa' }}>
            Building your connection...
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {FAST_FORWARD_SCENES.map((scene, i) => (
            <div
              key={scene}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-500"
              style={{
                background: i <= ffScene ? '#7c3aed20' : 'var(--s2)',
                opacity: i <= ffScene ? 1 : 0.35,
                border: `1px solid ${i <= ffScene ? '#7c3aed40' : 'var(--s3)'}`,
              }}
            >
              <span className="text-sm">{i <= ffScene ? '✓' : '○'}</span>
              <span className="text-sm" style={{ color: i <= ffScene ? 'var(--tx)' : 'var(--mt)' }}>
                {scene}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Step: Done ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--s0)', color: 'var(--tx)' }}>
      <div className="text-5xl mb-4">✨</div>
      <h2 className="text-2xl font-bold mb-2" style={{ color: '#a78bfa' }}>
        {companionName} remembers you
      </h2>
      <p className="text-sm" style={{ color: 'var(--mt)' }}>Opening your conversation...</p>
    </div>
  );
}

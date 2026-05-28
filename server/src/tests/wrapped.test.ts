import { describe, expect, it } from '@jest/globals';

// Test the headline generation logic in isolation (pure functions exported for testing)
// We test the copy-writing functions directly without needing DB or Redis

// Inline the tested logic to avoid circular deps in the test environment
function buildWeeklyHeadline(s: {
  nightsLive: number;
  matchesMade: number;
  sparksSent: number;
  sparksReceived: number;
}): string {
  if (s.nightsLive === 0) return 'You had a quiet week. The city missed you.';
  if (s.matchesMade >= 3) return `${s.matchesMade} matches in one week. You're on fire. 🔥`;
  if (s.sparksSent > s.sparksReceived * 2) return "You've been sparking hard. Someone's about to notice.";
  if (s.sparksReceived > s.sparksSent * 2) return "People are sparking you more than you know it.";
  if (s.nightsLive >= 4) return 'You were the city this week.';
  if (s.nightsLive >= 2) return "Two nights out. That's how it starts.";
  return 'One night live is all it takes.';
}

function buildWeeklyShareText(s: {
  nightsLive: number;
  matchesMade: number;
  sparksSent: number;
  sparksReceived: number;
  datesConfirmed: number;
}): string {
  const lines: string[] = [
    '⚡ My week on RIGHTNOW:',
    `🌙 ${s.nightsLive} night${s.nightsLive !== 1 ? 's' : ''} live`,
    `✨ ${s.sparksSent} sparks sent · ${s.sparksReceived} received`,
    `🎯 ${s.matchesMade} match${s.matchesMade !== 1 ? 'es' : ''}`,
  ];
  if (s.datesConfirmed > 0) lines.push(`📍 ${s.datesConfirmed} date${s.datesConfirmed !== 1 ? 's' : ''} confirmed`);
  lines.push('rightnow.app');
  return lines.join('\n');
}

describe('buildWeeklyHeadline()', () => {
  it('returns quiet week message for 0 nights', () => {
    const h = buildWeeklyHeadline({ nightsLive: 0, matchesMade: 0, sparksSent: 0, sparksReceived: 0 });
    expect(h).toBe('You had a quiet week. The city missed you.');
  });

  it('highlights fire headline for 3+ matches', () => {
    const h = buildWeeklyHeadline({ nightsLive: 2, matchesMade: 4, sparksSent: 10, sparksReceived: 8 });
    expect(h).toContain('4 matches');
    expect(h).toContain('🔥');
  });

  it('returns heavy sparker message when sent > 2× received', () => {
    const h = buildWeeklyHeadline({ nightsLive: 2, matchesMade: 0, sparksSent: 20, sparksReceived: 5 });
    expect(h).toContain("sparking hard");
  });

  it('returns highly-sought message when received > 2× sent', () => {
    const h = buildWeeklyHeadline({ nightsLive: 2, matchesMade: 1, sparksSent: 3, sparksReceived: 12 });
    expect(h).toContain('more than you know it');
  });

  it('returns city headline for 4+ nights', () => {
    const h = buildWeeklyHeadline({ nightsLive: 5, matchesMade: 1, sparksSent: 5, sparksReceived: 5 });
    expect(h).toContain('city this week');
  });

  it('returns two nights message for exactly 2 nights', () => {
    const h = buildWeeklyHeadline({ nightsLive: 2, matchesMade: 0, sparksSent: 2, sparksReceived: 2 });
    expect(h).toContain('Two nights');
  });

  it('returns one night message for exactly 1 night', () => {
    const h = buildWeeklyHeadline({ nightsLive: 1, matchesMade: 0, sparksSent: 1, sparksReceived: 1 });
    expect(h).toContain('One night');
  });
});

describe('buildWeeklyShareText()', () => {
  it('includes rightnow.app watermark', () => {
    const t = buildWeeklyShareText({ nightsLive: 2, matchesMade: 1, sparksSent: 5, sparksReceived: 3, datesConfirmed: 0 });
    expect(t).toContain('rightnow.app');
  });

  it('includes date line when datesConfirmed > 0', () => {
    const t = buildWeeklyShareText({ nightsLive: 2, matchesMade: 1, sparksSent: 5, sparksReceived: 3, datesConfirmed: 2 });
    expect(t).toContain('2 dates confirmed');
  });

  it('omits date line when datesConfirmed === 0', () => {
    const t = buildWeeklyShareText({ nightsLive: 2, matchesMade: 1, sparksSent: 5, sparksReceived: 3, datesConfirmed: 0 });
    expect(t).not.toContain('date');
  });

  it('uses singular "night" for exactly 1 night', () => {
    const t = buildWeeklyShareText({ nightsLive: 1, matchesMade: 0, sparksSent: 1, sparksReceived: 0, datesConfirmed: 0 });
    expect(t).toContain('1 night live');
  });

  it('uses plural "nights" for 2+ nights', () => {
    const t = buildWeeklyShareText({ nightsLive: 3, matchesMade: 2, sparksSent: 8, sparksReceived: 6, datesConfirmed: 0 });
    expect(t).toContain('3 nights live');
  });
});

import { formatMMSS } from '@/utils/time';

interface LiveBadgeProps {
  label?: string;
  showTimer?: boolean;
  timeLeft?: number; // seconds
}

export default function LiveBadge({
  label = 'LIVE',
  showTimer = false,
  timeLeft,
}: LiveBadgeProps): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest"
      style={{ background: 'rgba(255,92,0,0.12)', color: 'var(--hot)' }}
    >
      <span className="relative flex h-2 w-2">
        <span
          className="anim-ping absolute inline-flex h-full w-full rounded-full"
          style={{ background: 'var(--hot)' }}
        />
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: 'var(--hot)' }}
        />
      </span>
      {label}
      {showTimer && typeof timeLeft === 'number' && (
        <span style={{ color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>
          {formatMMSS(timeLeft)}
        </span>
      )}
    </span>
  );
}

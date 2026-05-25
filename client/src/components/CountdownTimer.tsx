import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMSS } from '@/utils/time';

type Variant = 'spark' | 'match' | 'meetup';

interface CountdownTimerProps {
  expiresAt: number; // epoch ms
  onExpire?: () => void;
  variant?: Variant;
}

const secondsLeft = (expiresAt: number): number =>
  Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

export default function CountdownTimer({
  expiresAt,
  onExpire,
  variant = 'spark',
}: CountdownTimerProps): React.JSX.Element {
  const [remaining, setRemaining] = useState(() => secondsLeft(expiresAt));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setRemaining(secondsLeft(expiresAt));

    const id = setInterval(() => {
      const next = secondsLeft(expiresAt);
      setRemaining(next);
      if (next <= 0 && !firedRef.current) {
        firedRef.current = true;
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const urgent = remaining < 30;
  const warning = !urgent && remaining < 120;
  const color = urgent ? 'var(--err)' : warning ? 'var(--gold)' : 'var(--hot)';

  return (
    <span
      className={cn('font-display font-extrabold tabular-nums', urgent && 'anim-shake')}
      style={{ color }}
      data-variant={variant}
    >
      {formatMSS(remaining)}
    </span>
  );
}

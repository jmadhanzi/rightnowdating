import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'ghost' | 'gold' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  children?: ReactNode;
}

const SIZES: Record<Size, CSSProperties> = {
  sm: { height: 38, padding: '0 16px', fontSize: 13 },
  md: { height: 48, padding: '0 20px', fontSize: 15 },
  lg: { height: 56, padding: '0 26px', fontSize: 17 },
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--hot), #ff7a33)',
    color: '#fff',
    boxShadow: '0 6px 22px var(--glow)',
  },
  ghost: {
    background: 'var(--s2)',
    color: 'var(--dm)',
    border: '1px solid var(--s4)',
  },
  gold: {
    background: 'linear-gradient(135deg, var(--gold), #ffea70)',
    color: '#000',
    boxShadow: '0 6px 22px rgba(255, 215, 0, 0.35)',
  },
  danger: {
    background: 'var(--err)',
    color: '#fff',
  },
};

function Spinner(): React.JSX.Element {
  return (
    <span
      className="inline-block h-[1em] w-[1em] animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled = false,
  type = 'button',
  onClick,
  children,
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={loading ? undefined : onClick}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold uppercase tracking-wide',
        'transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60',
        fullWidth && 'w-full',
      )}
      style={{ ...SIZES[size], ...VARIANTS[variant], borderRadius: 'var(--r)' }}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

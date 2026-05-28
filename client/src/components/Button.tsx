import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'ghost' | 'gold' | 'danger';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?:  Variant;
  size?:     Size;
  loading?:  boolean;
  icon?:     ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  type?:     'button' | 'submit';
  onClick?:  () => void;
  children?: ReactNode;
  className?: string;
  /** Override for icon-only buttons — must include text for screen readers */
  'aria-label'?: string;
}

// Standardised heights: L=52px M=44px S=36px (all ≥44px touch target for M/L)
const SIZES: Record<Size, CSSProperties> = {
  sm: { height: 36,  padding: '0 14px', fontSize: 13, minWidth: 44 },
  md: { height: 44,  padding: '0 20px', fontSize: 15 },
  lg: { height: 52,  padding: '0 26px', fontSize: 17 },
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--hot), #ff7a33)',
    color:      '#fff',
    boxShadow:  '0 6px 22px var(--glow)',
  },
  ghost: {
    background: 'var(--s2)',
    color:      'var(--dm)',
    border:     '1px solid var(--s4)',
  },
  gold: {
    background: 'linear-gradient(135deg, var(--gold), #f59e0b)',
    color:      '#fff',
    boxShadow:  '0 6px 22px rgba(217,119,6,0.4)',
  },
  danger: {
    background: 'var(--err)',
    color:      '#fff',
  },
};

function Spinner(): React.JSX.Element {
  return (
    <span
      className="inline-block h-[1em] w-[1em] animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

export default function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  icon,
  fullWidth = false,
  disabled  = false,
  type      = 'button',
  onClick,
  children,
  className,
  'aria-label': ariaLabel,
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={loading ? undefined : onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--r)] font-bold uppercase tracking-wide',
        // Interaction states
        'transition-all duration-[60ms] active:scale-[0.97]',
        // Focus ring — visible only for keyboard/non-pointer navigation (WCAG 2.4.7)
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]',
        // Disabled state — communicated visually and via attribute
        'disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'w-full',
        className,
      )}
      style={{ ...SIZES[size], ...VARIANTS[variant] }}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

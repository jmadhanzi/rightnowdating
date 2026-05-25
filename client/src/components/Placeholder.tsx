import type { ReactNode } from 'react';
import BottomNav from './BottomNav';

interface PlaceholderProps {
  title: string;
  subtitle?: string;
  showNav?: boolean;
  children?: ReactNode;
}

/** Lightweight screen scaffold used by foundation stubs. */
export default function Placeholder({
  title,
  subtitle,
  showNav = false,
  children,
}: PlaceholderProps): React.JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{
        background: 'var(--s0)',
        color: 'var(--tx)',
        paddingBottom: showNav ? 'var(--nav-h)' : 0,
      }}
    >
      <div className="anim-fup">
        <h1
          className="font-display text-4xl font-extrabold italic tracking-tight"
          style={{ color: 'var(--hot)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm" style={{ color: 'var(--dm)' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {showNav && <BottomNav />}
    </div>
  );
}

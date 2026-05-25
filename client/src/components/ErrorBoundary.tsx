import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, info.componentStack);
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ background: 'var(--s0)', color: 'var(--tx)' }}
      >
        <h1
          className="font-display text-5xl font-extrabold italic tracking-tighter"
          style={{ color: 'var(--hot)', textShadow: '0 0 30px var(--glow)' }}
        >
          RIGHTNOW
        </h1>
        <h2 className="mt-6 text-xl font-bold">Something went wrong</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--dm)' }}>
          An unexpected error occurred.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl px-6 py-3 font-bold uppercase tracking-wide"
          style={{ background: 'linear-gradient(135deg, var(--hot), #ff7a33)', color: '#fff' }}
        >
          Try again
        </button>
      </div>
    );
  }
}

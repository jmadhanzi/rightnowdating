import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ToastContext,
  type ToastContextValue,
  type ToastItem,
  type ToastType,
} from '@/hooks/useToast';

const MAX_VISIBLE = 3;
const DURATION_MS = 3000;

const TYPE_COLOR: Record<ToastType, string> = {
  success: 'var(--green)',
  error: 'var(--err)',
  warning: 'var(--gold)',
  info: '#3b9dff',
};

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = (idRef.current += 1);
      setToasts((current) => [...current, { id, type, message }].slice(-MAX_VISIBLE));
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      warning: (m) => show(m, 'warning'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[1000] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="anim-tin pointer-events-auto flex min-w-[220px] max-w-[340px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg"
            style={{
              background: 'var(--s2)',
              color: 'var(--tx)',
              borderLeft: `3px solid ${TYPE_COLOR[t.type]}`,
            }}
            role="status"
            onClick={() => dismiss(t.id)}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: TYPE_COLOR[t.type] }}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

import type { Vibe } from '@rightnow/shared';
import { cn } from '@/utils/cn';
import { VIBES } from '@/utils/vibes';

interface VibeChipProps {
  vibe:      Vibe;
  selected?: boolean;
  onSelect?: (vibe: Vibe) => void;
}

export default function VibeChip({
  vibe,
  selected = false,
  onSelect,
}: VibeChipProps): React.JSX.Element {
  const { emoji, label } = VIBES[vibe];

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`${label} vibe${selected ? ' — selected' : ''}`}
      onClick={() => onSelect?.(vibe)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
        // 44px min height for WCAG touch target compliance (2.5.5)
        'min-h-[44px]',
        'transition-all duration-150 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hot)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--s0)]',
      )}
      style={{
        background: selected ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
        color:  selected ? 'var(--hot)' : 'var(--dm)',
        border: `1px solid ${selected ? 'var(--hot)' : 'var(--s4)'}`,
        // Indicate selected state with a non-color visual (checkmark) for WCAG 1.4.1
        boxShadow: selected ? '0 0 0 1px var(--hot)' : 'none',
      }}
    >
      <span className="text-base" aria-hidden="true">{emoji}</span>
      {label}
      {selected && (
        <span className="sr-only"> (selected)</span>
      )}
    </button>
  );
}

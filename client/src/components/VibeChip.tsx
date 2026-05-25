import type { Vibe } from '@rightnow/shared';
import { cn } from '@/utils/cn';
import { VIBES } from '@/utils/vibes';

interface VibeChipProps {
  vibe: Vibe;
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
      onClick={() => onSelect?.(vibe)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold',
        'transition-colors duration-150 active:scale-95',
      )}
      style={{
        background: selected ? 'rgba(255,92,0,0.15)' : 'var(--s2)',
        color: selected ? 'var(--hot)' : 'var(--dm)',
        border: `1px solid ${selected ? 'var(--hot)' : 'var(--s4)'}`,
      }}
    >
      <span className="text-base">{emoji}</span>
      {label}
    </button>
  );
}

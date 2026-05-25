type Size = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  emoji?: string;
  size?: Size;
  showOnline?: boolean;
  trustScore?: number;
}

const SIZE_PX: Record<Size, number> = { sm: 36, md: 50, lg: 90, xl: 170 };

/** Trust score → border color. */
function trustColor(score: number | undefined): string {
  if (score === undefined) return 'var(--s4)';
  if (score <= 40) return 'var(--err)';
  if (score <= 65) return 'var(--gold)';
  if (score <= 80) return '#3b9dff';
  return 'var(--green)';
}

export default function Avatar({
  emoji = '🧑',
  size = 'md',
  showOnline = false,
  trustScore,
}: AvatarProps): React.JSX.Element {
  const px = SIZE_PX[size];
  const dot = Math.max(10, Math.round(px * 0.22));

  return (
    <span className="relative inline-flex shrink-0" style={{ width: px, height: px }}>
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: px,
          height: px,
          background: 'var(--s3)',
          border: `2px solid ${trustColor(trustScore)}`,
          fontSize: Math.round(px * 0.5),
        }}
      >
        {emoji}
      </span>
      {showOnline && (
        <span
          className="absolute rounded-full"
          style={{
            width: dot,
            height: dot,
            right: 0,
            bottom: 0,
            background: 'var(--green)',
            border: '2px solid var(--s0)',
            boxShadow: '0 0 8px var(--gg)',
          }}
        />
      )}
    </span>
  );
}

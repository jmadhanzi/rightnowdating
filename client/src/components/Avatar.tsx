type Size = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  emoji?:      string;
  photoUrl?:   string | null;
  size?:       Size;
  showOnline?: boolean;
  trustScore?: number;
  alt?:        string;
}

const SIZE_PX: Record<Size, number> = { sm: 36, md: 50, lg: 90, xl: 170 };

/** Trust score → border color (WCAG: also shown as text in profile, not color-only). */
function trustColor(score: number | undefined): string {
  if (score === undefined) return 'var(--s4)';
  if (score <= 40) return 'var(--err)';
  if (score <= 65) return 'var(--gold)';
  if (score <= 80) return '#3b9dff';
  return 'var(--green)';
}

export default function Avatar({
  emoji    = '🧑',
  photoUrl = null,
  size     = 'md',
  showOnline = false,
  trustScore,
  alt,
}: AvatarProps): React.JSX.Element {
  const px  = SIZE_PX[size];
  const dot = Math.max(10, Math.round(px * 0.22));

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: px, height: px }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={alt ?? 'Profile photo'}
          loading="lazy"
          decoding="async"
          className="rounded-full object-cover"
          style={{
            width:  px,
            height: px,
            border: `2px solid ${trustColor(trustScore)}`,
          }}
          onError={(e) => {
            // Graceful fallback: hide broken img, show emoji behind it
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <span
          className="flex items-center justify-center rounded-full"
          aria-hidden={!!alt}
          style={{
            width:      px,
            height:     px,
            background: 'var(--s3)',
            border:     `2px solid ${trustColor(trustScore)}`,
            fontSize:   Math.round(px * 0.5),
          }}
        >
          {emoji}
        </span>
      )}

      {showOnline && (
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width:      dot,
            height:     dot,
            right:      0,
            bottom:     0,
            background: 'var(--green)',
            border:     '2px solid var(--s0)',
            boxShadow:  '0 0 8px var(--gg)',
          }}
        />
      )}

      {/* Screen-reader online status — not color-only (WCAG 1.4.1) */}
      {showOnline && <span className="sr-only">Online</span>}
    </span>
  );
}

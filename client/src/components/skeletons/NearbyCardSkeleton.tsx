export default function NearbyCardSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex w-36 shrink-0 flex-col items-center gap-2 rounded-2xl p-3"
      style={{ background: 'var(--s2)', border: '1px solid var(--s4)' }}
    >
      <div className="skeleton h-12 w-12 rounded-full" />
      <div className="skeleton h-4 w-20" />
      <div className="skeleton h-3 w-14" />
      <div className="skeleton mt-1 h-7 w-full rounded-lg" />
    </div>
  );
}

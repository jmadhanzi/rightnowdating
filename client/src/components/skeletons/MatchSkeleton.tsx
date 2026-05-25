export default function MatchSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col items-center gap-4 pt-24"
      style={{ background: 'var(--s0)' }}
    >
      <div className="skeleton h-[170px] w-[170px] rounded-full" />
      <div className="skeleton mt-4 h-8 w-48" />
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-2 h-12 w-64 rounded-xl" />
    </div>
  );
}

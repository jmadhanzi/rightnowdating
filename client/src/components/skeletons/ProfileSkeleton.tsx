export default function ProfileSkeleton(): React.JSX.Element {
  return (
    <div
      className="flex min-h-screen flex-col items-center gap-4 px-5 pt-16"
      style={{ background: 'var(--s0)' }}
    >
      <div className="skeleton h-28 w-28 rounded-full" />
      <div className="skeleton h-7 w-40" />
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-2 h-16 w-full rounded-2xl" />
      <div className="grid w-full grid-cols-3 gap-3">
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
        <div className="skeleton h-20 rounded-2xl" />
      </div>
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}

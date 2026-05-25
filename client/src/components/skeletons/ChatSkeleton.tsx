export default function ChatSkeleton(): React.JSX.Element {
  const rows = [false, true, false, true, false];
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {rows.map((mine, i) => (
        <div key={i} className={mine ? 'flex justify-end' : 'flex justify-start'}>
          <div className="skeleton h-9 rounded-2xl" style={{ width: `${45 + ((i * 13) % 35)}%` }} />
        </div>
      ))}
    </div>
  );
}

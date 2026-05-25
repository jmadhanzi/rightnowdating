/** Full-screen brand splash — also used as the Suspense fallback. */
export default function Splash(): React.JSX.Element {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
      style={{ background: 'var(--s0)' }}
    >
      <div className="pointer-events-none absolute flex h-64 w-64 items-center justify-center">
        <span
          className="anim-pring absolute h-full w-full rounded-full"
          style={{ background: 'rgba(255,92,0,0.2)' }}
        />
        <span
          className="anim-pring absolute h-full w-full rounded-full"
          style={{ background: 'rgba(255,92,0,0.1)', animationDelay: '0.6s' }}
        />
      </div>
      <h1
        className="relative z-10 select-none font-display text-6xl font-extrabold italic tracking-tighter"
        style={{ color: 'var(--hot)', textShadow: '0 0 30px var(--glow)' }}
      >
        RIGHTNOW
      </h1>
      <p
        className="relative z-10 mt-3 text-xs font-bold uppercase tracking-[0.3em]"
        style={{ color: 'var(--dm)' }}
      >
        Meet someone live
      </p>
    </main>
  );
}

/**
 * RIGHTNOW splash. Black canvas with the wordmark centered in electric orange,
 * wrapped in the brand's concentric pulse rings.
 */
export default function App() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-s0">
      {/* Concentric pulse rings (brand "live activity" motif) */}
      <div className="pointer-events-none absolute flex h-64 w-64 items-center justify-center">
        <span className="absolute h-full w-full rounded-full bg-hot/20 animate-pulse-ring" />
        <span
          className="absolute h-full w-full rounded-full bg-hot/10 animate-pulse-ring"
          style={{ animationDelay: '0.6s' }}
        />
        <span
          className="absolute h-full w-full rounded-full bg-hot/5 animate-pulse-ring"
          style={{ animationDelay: '1.2s' }}
        />
      </div>

      <h1 className="relative z-10 select-none font-display text-6xl font-extrabold italic tracking-tighter text-hot drop-shadow-[0_0_30px_rgba(255,92,0,0.6)]">
        RIGHTNOW
      </h1>
      <p className="relative z-10 mt-3 font-sans text-label-bold uppercase tracking-[0.3em] text-on-surface-variant">
        Meet someone live
      </p>
    </main>
  );
}

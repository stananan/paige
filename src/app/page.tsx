import Link from "next/link";
import SponsorOrbital from "./SponsorOrbital";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col">
      {/* Hero — fills the first viewport so the sponsor wheel sits a page down */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        {/* Hero glow (Cron's orange CTA halo, recolored blue) */}
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[75vh]" />

        <main className="relative z-10 mx-auto flex w-full max-w-[100rem] flex-1 flex-col px-10 sm:px-16 lg:px-24">
          <div className="mt-28 flex flex-col items-start gap-12 lg:flex-row lg:items-start lg:justify-between lg:gap-24">
            {/* Words */}
            <div className="flex flex-col items-start text-left">
              <h1 className="font-display whitespace-nowrap text-4xl font-normal leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
                Your in-meeting <span className="font-bold">assistant.</span>
                <br />
                Your time <span className="font-bold">saver.</span>
                <br />
                Your <span className="font-bold text-accent">Paige.</span>
              </h1>

              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/room"
                  className="rounded-full bg-accent px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-strong"
                >
                  Join demo room
                </Link>
                <Link
                  href="/demo-company"
                  className="rounded-full border border-accent bg-white px-8 py-3.5 text-base font-semibold text-accent transition hover:bg-accent/5"
                >
                  View demo data
                </Link>
              </div>
            </div>

            {/* Portrait product shot, to the right of the words */}
            <ProductMock />
          </div>
        </main>
      </section>

      {/* Interactive sponsor explanation wheel */}
      <SponsorOrbital />
    </div>
  );
}

// A stylized "screenshot" of Paige answering live — Cron's hero product shot,
// rebuilt as a light/blue mock so the landing sells the demo beat.
function ProductMock() {
  return (
    <div className="w-full max-w-xs shrink-0">
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-white shadow-2xl shadow-accent/10">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-foreground/5 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-foreground/15" />
          <span className="h-3 w-3 rounded-full bg-foreground/15" />
          <span className="h-3 w-3 rounded-full bg-foreground/15" />
          <span className="ml-3 font-mono text-xs text-muted">paige · room</span>
        </div>

        {/* Stacked vertically -> portrait */}
        <div className="flex flex-col gap-4 p-5 text-left">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              Heard
            </p>
            <p className="mt-1 text-sm text-foreground/80">
              “Paige, compare our revenue the last 10 years.”
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            Searching the company documents…
          </div>

          {/* Paige answer card */}
          <div className="rounded-xl border border-accent/15 bg-accent/[0.04] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                P
              </span>
              <span className="text-sm font-semibold">Paige</span>
            </div>
            <p className="mt-3 text-sm font-medium leading-snug text-foreground">
              Revenue grew from $1.2B to $4.8B over the decade — a 4× increase.
            </p>
            <MiniChart />
            <span className="mt-3 inline-block rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-[11px] font-medium text-accent">
              FY24-Annual.pdf · p.12
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniChart() {
  const bars = [18, 26, 30, 38, 44, 52, 60, 71, 84, 100];
  return (
    <svg viewBox="0 0 240 70" role="img" aria-label="Revenue trend" className="mt-3 w-full">
      <defs>
        <linearGradient id="mock-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 24 + 4}
          y={66 - (h / 100) * 60}
          width={16}
          height={(h / 100) * 60}
          rx={3}
          fill="url(#mock-bar)"
        />
      ))}
    </svg>
  );
}

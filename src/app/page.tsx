import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <main className="flex max-w-2xl flex-col items-center gap-8">
        <span className="rounded-full border border-foreground/15 px-3 py-1 font-mono text-xs uppercase tracking-widest text-foreground/60">
          Live meeting copilot
        </span>

        <h1 className="text-6xl font-semibold tracking-tight sm:text-7xl">Paige</h1>

        <p className="text-balance text-lg leading-8 text-foreground/70 sm:text-xl">
          She sits in the room, listens the whole time, and acts when called. Say{" "}
          <span className="font-medium text-foreground">
            &ldquo;Paige, compare our revenue the last 10 years&rdquo;
          </span>{" "}
          — she retrieves a cited answer, speaks it, shares her screen with the chart, and
          drops in a generated visual a beat later.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/room"
            className="rounded-full bg-foreground px-7 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
          >
            Enter the room →
          </Link>
          <Link
            href="/demo-company"
            className="rounded-full border border-foreground/20 px-7 py-3 text-base font-medium transition-colors hover:bg-foreground/5"
          >
            View demo company
          </Link>
        </div>

        <p className="font-mono text-xs text-foreground/40">
          Moss · LiveKit · Unsiloed · MiniMax · Qwen · TrueFoundry
        </p>
      </main>
    </div>
  );
}

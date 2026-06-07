# Paige — Live AI Meeting Copilot

A LiveKit meeting room for the human participants, with Paige running in a browser-side
copilot panel. Paige listens and acts only when addressed by name ("Paige, …"). On command she
retrieves from a Moss semantic index, speaks a one-line cited answer through MiniMax Speech
2.8 HD, and renders a deterministic chart from retrieved PDF values. The answer LLM runs
through TrueFoundry. Generated images are not shown for factual answers because they can
distort labels and values.
Built for the YC Conversational AI Hackathon, Jun 6–7 2026.

- Full approved design/plan: `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`
- Build order + live status: see `README.md`
- Stack: Next.js 16 (App Router, TS) on Vercel · LiveKit · Moss · Unsiloed · MiniMax · Qwen · TrueFoundry
- Corpus lives in nested folders under `/data` (gitignored), pre-ingested one company at a
  time via `bun run ingest --company=<folder>`.
  `bun run demo:seed` regenerates and ingests the FDC demo company. Demo runs on a warm
  Moss index, not live Drive.
- Demo-first: protect the hero beat (a cited answer and grounded chart arriving live).

@AGENTS.md

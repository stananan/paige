# Paige — Live AI Meeting Copilot

A 3-person LiveKit meeting room (you + a friend + Paige as an agent participant). Paige
listens the whole time and acts only when addressed by name ("Paige, …"). On command she
retrieves from a Moss semantic index, speaks a one-line cited answer, shows a chart, then a
beat later drops in a generated image (Qwen via DashScope vs MiniMax). The answer LLM runs
through TrueFoundry.
Built for the YC Conversational AI Hackathon, Jun 6–7 2026.

- Full approved design/plan: `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`
- Build order + live status: see `README.md`
- Stack: Next.js 16 (App Router, TS) on Vercel · LiveKit · Moss · Unsiloed · MiniMax · Qwen · TrueFoundry
- Corpus lives in `/data` (gitignored), pre-ingested via `bun run ingest`. Demo runs on a warm index, not live Drive.
- Demo-first: protect the hero beat (a cited answer arriving live). Wire the image race LAST.

@AGENTS.md

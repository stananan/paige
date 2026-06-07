# Paige

**Live AI meeting copilot.** Paige joins a meeting as a third participant, listens the
whole time, and acts when addressed: _"Paige, compare our revenue the last 10 years"_ →
she retrieves from a semantic index, **speaks** a one-line cited answer, shows a chart,
and a beat later drops in a **generated image** — all live.

Built for the **YC Conversational AI Hackathon** (Jun 6–7 2026), Co-Pilot track.

## How it works

1. **Addressed activation** — always listening for context, but only _acts_ on "Paige, …". No talking over you.
2. **Two-beat response** — fast (spoken takeaway + cited card + chart), then slow (a
   generated image, labeled with the model that made it). The fast beat hides image-gen latency.
3. **Model race** — Qwen and MiniMax generate through their direct APIs in parallel; the
   first to finish wins and is shown. TrueFoundry fronts the answer LLM.
4. **Citations on every answer** — source file + page, from Moss metadata. Factual charts are
   rendered deterministically; generated visuals are labeled and never treated as evidence.

## Stack

Next.js 16 (App Router, TypeScript) on Vercel · **LiveKit** (room + voice) · **Moss**
(semantic retrieval) · **Unsiloed** (PDF parsing) · **MiniMax** + **Qwen via DashScope**
(image race) · **TrueFoundry** (answer LLM gateway).

## Setup

    npm install
    cp .env.example .env.local   # fill in service keys
    npm run dev                  # http://localhost:3000

Pre-ingest the corpus (offline, before the demo):

    # drop PDFs into /data/<company>/, then:
    bun run ingest

Regenerate and ingest the built-in FDC synthetic demo company:

    bun run demo:seed

Smoke-test Qwen image generation (writes to ignored `data/.qwen-test/`):

    bun run qwen:test

## Build order (spine first, flourish last)

- [x] **0–1 Skeleton + deploy** — Next.js app + git + live on Vercel (paige-beta.vercel.app).
- [x] **1–3 Real 3-person room** — token route + LiveKit room (video grid + ControlBar) wired & verified. Real two-tab webcam test pending on hardware.
- [x] **3–6 Paige's voice spine** — ✅ Browser Web Speech API STT (wake "Paige") in `/room` + MiniMax TTS (`/api/tts`). Needs a real-Chrome mic test. (LiveKit-Agents path parked in `agent/`, needs Deepgram.)
- [x] **6–9 Ingest pipeline** — `bun run ingest`: /data → Unsiloed parse with cached results → page-preserving chunks → synchronized Moss index + live citation query verification
- [x] **9–13 Fast beat (hero)** — wake cmd → Moss retrieve → GPT-5.4 Mini (TrueFoundry) → spoken answer + cited card + deterministic chart; production verified
- [x] **Demo workspace + corpus** — `/demo-company` Google-Drive-style file browser (open any file to read what Paige cites), nine reproducible FDC PDFs, nested company-folder ingestion, and six live cited demo prompts
- [x] **Paige presence + general chat** — Paige is a participant tile in the room grid and "shares her screen" (a featured stage with the cited answer/chart/image) when she presents data. Off-corpus questions now get a conversational answer instead of a dead end; a flaky index degrades to conversation instead of failing.
- [x] **13–16 Citations + chart polish** — source file + page on every card; charts render and are value-grounded against the cited sources (unit declared once is OK)
- [x] **16–19 Slow beat** — Qwen vs MiniMax race (`/api/image`); first valid image wins, loser aborted, shown labeled "Generated · &lt;model&gt;"; deterministic chart stays the fallback
- [ ] **19–21 Stretch: live upload** — one "upload a doc" → live Unsiloed parse → answerable
- [ ] **21–23 Rehearse + harden** — run the full demo twice; prep a recorded fallback clip
- [ ] **23–24 Submit** — lock build, write submission, demo script

Full approved plan: `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`

## Project layout

    src/app/
      page.tsx                  landing
      demo-company/page.tsx     FDC synthetic company workspace
      room/page.tsx             the hardcoded meeting room (LiveKit + Paige go here)
    src/data/fdc.ts             shared FDC UI and PDF source data
    src/lib/env.ts      typed access to service credentials
    scripts/ingest.ts           recursive offline corpus ingest (Unsiloed → chunk → Moss)
    scripts/generate-fdc-pdfs.ts reproducible FDC PDF generator
    data/                       corpus PDFs (gitignored), pre-ingested before the demo

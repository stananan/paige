# Paige

**Live AI meeting copilot.** Paige joins a meeting as a third participant. Say her name
once to start a flowing session: _"Paige, compare our revenue the last 10 years"_ →
she retrieves from a semantic index, **speaks** a one-line cited answer, and renders a
source-grounded chart for everyone — all live.

Built for the **YC Conversational AI Hackathon** (Jun 6–7 2026), Co-Pilot track.

## How it works

1. **Flowing session** — say "Paige" once, ask natural follow-ups, and say "thanks Paige"
   to return to the meeting. Deepgram transcribes every participant separately; three
   substantive words interrupt Paige while filler sounds are ignored.
2. **Shared grounded response** — every participant sees and hears the same spoken takeaway,
   cited card, generated visual, and PDF page preview inside Paige's equal-sized tile.
3. **Safe generated visuals** — Qwen/MiniMax supplies the visible presentation image while
   exact source values are overlaid in HTML. Model-written labels are blurred; the
   deterministic SVG is retained only as provider-failure fallback.
4. **Citations on every answer** — clickable source PDF + page, from Moss metadata. Chart
   labels and values are copied from retrieved PDF tables and validated before rendering.

## Stack

Next.js 16 (App Router, TypeScript) on Vercel · **LiveKit** (room + voice) · **Moss**
(semantic retrieval) · **Unsiloed** (PDF parsing) · **Deepgram Nova-3** (STT) ·
**MiniMax Speech 2.8 HD** (TTS) ·
**TrueFoundry** (answer LLM gateway). Qwen and MiniMax image generation supplies only the
visual layer behind exact source-grounded values.

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
- [x] **3–6 Paige's voice spine** — ✅ each participant's LiveKit mic is segmented locally, transcribed by Deepgram Nova-3 through authenticated `/api/transcribe`, and attributed by LiveKit identity; MiniMax TTS remains `/api/tts`
- [x] **6–9 Ingest pipeline** — `bun run ingest`: /data → Unsiloed parse with cached results → page-preserving chunks → synchronized Moss index + live citation query verification
- [x] **9–13 Fast beat (hero)** — wake cmd → Moss retrieve → GPT-5.4 Mini (TrueFoundry) → spoken answer + cited card + deterministic chart; production verified
- [x] **Demo workspace + corpus** — `/demo-company` lists 15 downloadable FDC PDFs, including Q1-Q4 2025, Q1-Q2 2026, and estimated Q3 2026 results; the live Moss index contains 44 page-cited documents and ten prepared prompts
- [x] **Paige presence + general chat** — Paige remains the same size as every webcam tile and renders cited answers/charts inside her tile. The text dock can be closed and reopened. Obvious conversational prompts bypass Moss; ambiguous business prompts still retrieve.
- [x] **13–16 Citations + chart polish** — every evidence chip opens the exact public PDF page; charts render and are value-grounded across one or more cited source PDFs
- [x] **Shared meeting experience** — LiveKit reliable packets synchronize attributed transcripts, Paige sessions, answers, PDF previews, and image streams; every browser plays MiniMax TTS
- [x] **16–19 Image presentation** — Qwen vs MiniMax returns a binary image shown to everyone; exact values remain source-grounded HTML overlays and the SVG is failure-only
- [ ] **19–21 Stretch: live upload** — one "upload a doc" → live Unsiloed parse → answerable
- [ ] **21–23 Rehearse + harden** — run the full demo twice; prep a recorded fallback clip
- [ ] **23–24 Submit** — lock build, write submission, demo script

Full approved plan: `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`

## Project layout

    src/app/
      page.tsx                  landing
      demo-company/page.tsx     FDC synthetic company workspace
      room/page.tsx             the hardcoded meeting room (LiveKit + Paige go here)
      api/transcribe/route.ts   authenticated Deepgram Nova-3 transcription
    src/data/fdc.ts             shared FDC UI and PDF source data
    src/lib/deepgram-browser.ts per-participant utterance capture
    src/lib/env.ts              typed access to service credentials
    scripts/ingest.ts           recursive offline corpus ingest (Unsiloed → chunk → Moss)
    scripts/generate-fdc-pdfs.ts reproducible FDC PDF generator
    data/                       corpus PDFs (gitignored), pre-ingested before the demo

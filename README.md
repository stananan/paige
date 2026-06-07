# Paige — Live AI Meeting Copilot

**Live AI meeting copilot.** Paige sits in a LiveKit meeting as a third participant, listens
the whole time, and acts when addressed. Hold **Space**, ask _"Compare our revenue the last
10 years"_, release to send → she retrieves from a semantic index, **speaks** a one-line cited
answer, and renders a source-grounded chart and a generated visual for everyone — all live.

Built for the **YC Conversational AI Hackathon** (Jun 6–7 2026), Co-Pilot track.
**This is the final build** — live at **https://paige-beta.vercel.app**.

## How it works

1. **Push-to-talk** — hold Space while speaking and release to send the complete utterance.
   A short microphone pre-roll keeps Deepgram from clipping the opening words; every
   participant is transcribed separately, and typed spaces never activate recording.
2. **Shared grounded response** — every participant sees and hears the same spoken takeaway,
   cited card, generated visual, and PDF page preview inside Paige's equal-sized tile.
3. **Safe generated visuals** — data visuals require a grounded chart or citations, while
   creative drawing requests bypass document retrieval. MiniMax receives a subject-specific
   native 16:9 prompt; exact source values are overlaid in HTML and generated pixels are
   never evidence.
4. **Citations on every answer** — clickable source PDF + page, from Moss metadata. Chart
   labels and values are copied from retrieved PDF tables and validated before rendering.

## How we used each sponsor tool

Paige's hero beat — a _spoken, cited answer plus a grounded visual arriving live in the
room_ — is a relay across six sponsor tools. The exact role each one plays:

### 🔎 Moss — semantic retrieval (the foundation)
Moss is the knowledge base every answer is grounded in. During ingestion we sync **page-cited
documents** — one per PDF page, each carrying `{ sourceFile, page }` metadata — into the
`paige` index. At query time `/api/ask` runs hybrid retrieval (Moss's HTTP query API plus a
ranked `getDocs` pass) to pull the exact passages that answer the question. Every citation
Paige speaks and every chart value traces back to what Moss returned: no Moss hit, no claim.

### 🎥 LiveKit — the live room + shared state
LiveKit runs the real-time meeting: video, audio, and transport for you, a teammate, and
Paige. `/api/token` mints short-lived access tokens. Beyond media, LiveKit is Paige's nervous
system — we use **reliable data packets** and **byte streams** to broadcast attributed
transcripts, thinking/answer events, the cited PDF preview, and the generated image, so every
participant sees and hears the *same* response inside Paige's equal-sized tile.

### 📄 Unsiloed — PDF parsing → citable chunks
Unsiloed turns source PDFs into structured, page-aware text during offline ingestion
(`bun run ingest`). Parse results are cached by file hash; each page becomes clean Markdown
that we slice into bounded, page-numbered chunks. That page fidelity is what lets Paige cite
"FDC FY2025 Annual Report · p.12" and deep-link to the exact PDF page in the room.

### 🧠 TrueFoundry — the answer-LLM gateway
The answer model (GPT-5.4 Mini) runs through TrueFoundry's gateway. Retrieved Moss context and
the question go through TrueFoundry, which returns the concise one-line cited reply — and
structured chart data when the question is comparative. The gateway keeps the model swappable
and gives one place for auth, routing, and fallback.

### 🗣️ MiniMax — Paige's voice + presentation visuals
MiniMax does double duty. **Speech 2.8 HD** (`/api/tts`, voice `English_radiant_girl`) gives
Paige her spoken voice; the MP3 streams back and plays in every browser. **Image-01**
(`/api/image`) generates the native 16:9 presentation visual that lands a beat after the
answer — the exact source numbers are overlaid in HTML on top, so generated pixels are styling,
never evidence.

### 🖼️ Qwen — image generation (validated alternate backend)
Qwen image generation, via Alibaba DashScope's synchronous `z-image-turbo` endpoint, is the
validated alternate visual backend (`bun run qwen:test`, `src/lib/qwen-image.ts`). It
established the "generated visual + source-grounded HTML overlay" pattern that the live
MiniMax Image-01 path now serves in the room.

## Stack

Next.js 16 (App Router, TypeScript) on Vercel · **LiveKit** (room + voice) · **Moss**
(semantic retrieval) · **Unsiloed** (PDF parsing) · **Deepgram Nova-3** (STT) ·
**MiniMax Speech 2.8 HD** (TTS) ·
**TrueFoundry** (answer LLM gateway) · **MiniMax Image-01** (generated presentation visuals).

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
- [x] **9–13 Fast beat (hero)** — push-to-talk → Moss retrieve → GPT-5.4 Mini (TrueFoundry) → spoken answer + cited card + deterministic chart; production verified
- [x] **Demo workspace + corpus** — `/demo-company` lists 15 downloadable FDC PDFs, including Q1-Q4 2025, Q1-Q2 2026, and estimated Q3 2026 results; the live Moss index contains 44 page-cited documents and ten prepared prompts
- [x] **Paige presence + general chat** — Paige remains the same size as every webcam tile and renders cited answers/charts inside her tile. The text dock can be closed and reopened. Obvious conversational prompts bypass Moss; ambiguous business prompts still retrieve.
- [x] **13–16 Citations + chart polish** — every evidence chip opens the exact public PDF page; charts render and are value-grounded across one or more cited source PDFs
- [x] **Shared meeting experience** — LiveKit reliable packets synchronize attributed transcripts, answers, PDF previews, and image streams; every browser plays MiniMax TTS
- [x] **16–19 Image presentation** — MiniMax Image-01 returns a subject-specific native 16:9 image shown to everyone; unsupported data requests do not generate, valid image/draw/chart synonyms share deterministic extraction, and exact values remain source-grounded HTML overlays
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

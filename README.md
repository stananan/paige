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
   Pressing Space while Paige speaks stops her immediately and begins the next utterance.
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

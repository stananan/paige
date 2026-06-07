# Paige — Project Handoff (read this first)

Context for any agent (Codex/Claude) continuing this project. Pairs with `README.md`
(build tracker) and `CLAUDE.md`.

## What Paige is
A **live AI meeting copilot** built for the YC Conversational AI Hackathon (Jun 6–7 2026).
A 3-person LiveKit room (you + a friend + Paige). Say "Paige" once to open a shared
copilot session, continue with natural follow-ups, then say "thanks Paige" or "that's it"
to close the session. On command she retrieves from a **Moss**
semantic index over pre-ingested company financial documents, **speaks** a one-line cited
answer, and presents the same cited answer, exact chart, PDF preview, and optional generated
backdrop to everyone. The answer LLM runs through TrueFoundry. Demo-first; protect the
"cited answer arriving live" hero beat.

Full approved design/plan (outside the repo): `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`

## Status — what's built and working
- **Next.js 16** (App Router, TS, Tailwind v4). Live: **https://paige-beta.vercel.app** ·
  GitHub: **github.com/stananan/paige** (branch `main`) · Vercel project `stananans-projects/paige`.
- `/` landing with room and demo-company entry points.
- `/demo-company` — a presentation-ready synthetic FDC workspace with financials,
  accounts, incidents, roadmap, security, support, and seven prepared demo questions.
- `/room` — LiveKit room: prejoin (name) → video grid (`GridLayout`+`ParticipantTile`) +
  `ControlBar`. Token minted by `/api/token` (livekit-server-sdk).
- **Paige's voice spine (browser approach):**
  - **Ears (STT):** **Deepgram Nova-3**. Every browser segments only its local LiveKit
    microphone track, sends the utterance to authenticated `/api/transcribe`, and receives
    the speaker name from the verified LiveKit token. Wake matching still accepts
    page/pages/padge/paij. Filler/casual fragments are ignored and Paige only stops speaking
    after at least three substantive words.
  - **Voice (TTS):** **MiniMax `speech-2.8-hd`, voice `English_radiant_girl`, speed `1.2`**
    via `/api/tts`. Plays MP3 in-browser. This configuration was live-verified.
  - **Shared session:** one wake word opens a flowing conversation; follow-ups include the
    last six turns, and natural end phrases close it for the whole room.
  - **Chat box** in the same panel (type to Paige) — any participant can ask or end a session.
  - LiveKit reliable data packets synchronize attributed transcripts plus question,
    answer, and session state. Each browser plays the same MiniMax answer, so every
    participant hears Paige.
  - Conversational/filler speech does not clear the current visual or PDF. The previous
    grounded presentation remains until a different grounded answer replaces it.
- **Ingestion pipeline is complete:** `bun run ingest` recursively reads one selected
  `/data/<company>/**/*.pdf` corpus, caches Unsiloed
  parse results by file hash, reconstructs page-specific Markdown, creates bounded Moss
  documents carrying `{sourceFile, page, sourceUrl}`, synchronizes the `paige-docs` index, then loads
  it and verifies a real query returns citation metadata.
- **FDC demo corpus is complete:** `bun run demo:seed` generates 15 PDFs from
  `src/data/fdc.ts`, including separate Q1-Q4 2025 reports, Q1 and Q2 2026 reports,
  and estimated Q3 2026 results. It copies them to the public demo library, parses every page through Unsiloed,
  and indexes 44 page-cited Moss documents. The primary demo prompts summarize the latest
  Q2 report, answer relative-period questions such as "quarter 2 last year," and build
  grounded charts across all four 2025 quarterly reports.
- **`agent/`** — a Python **LiveKit-Agents** worker (the original "Paige as a real participant"
  design: Deepgram STT + MiniMax TTS). **PARKED.** We switched to browser STT because Deepgram
  signup was blocked. It's import-verified (livekit-agents 1.5.17) but never run live (needs
  `DEEPGRAM_API_KEY`). Keep as a fallback.

## The real next steps
- **Task #3 — ingest: COMPLETE.** Live verification succeeded against Unsiloed and Moss.
- **Task #4 — the fast beat (hero): COMPLETE.** `/api/ask` performs hybrid Moss cloud
  retrieval plus a ranked `getDocs` pass → **GPT-5.4 Mini via TrueFoundry** → a
  validated concise answer, citations, and source-grounded chart data. `PaigeListener`
  renders the result and speaks it through `/api/tts`. Production browser verification
  succeeded on `paige-beta.vercel.app`.
- **Task #5 — citations/chart polish: COMPLETE.** Charts now actually render and ground:
  the unit (e.g. "USD millions") is matched against the whole cited document, not beside
  every cell, so values pulled from tables/headers pass. Same relaxation applied to the
  spoken-answer number check so a table-only value no longer hard-fails the request.
- **Task #6 — Qwen vs MiniMax image race: COMPLETE WITH A SAFETY BOUNDARY.** Explicit
  chart/visual prompts race both providers through `src/lib/image-race.ts`. The winner is
  returned as binary image data, shared to every participant, blurred to make provider-made
  text unreadable, and covered with exact source-grounded HTML values. The deterministic SVG
  is retained only if all image providers fail.
- **General conversation + resilience: COMPLETE.** Obvious conversation bypasses Moss and
  goes directly to `generateConversationalAnswer`; ambiguous business questions still
  retrieve. Retrieval errors and answer-validation failures use deterministic report/chart
  extraction when possible, then degrade to conversation instead of a 502.
- **Paige presence: COMPLETE.** Paige stays the same size as every webcam tile. Cited
  answers, charts, and an embedded cited-PDF page preview render inside her tile; the text
  dock can be closed and reopened. This synchronized presentation surface is the
  browser-safe replacement for silently starting a real screen share.
- **Demo company PDF library: COMPLETE.** `/demo-company` lists the actual generated PDFs
  (`DriveExplorer`); each opens in the browser and is labeled Unsiloed-parsed/Moss-indexed.
  Citations inside Paige's participant tile open the exact PDF page in a new tab.
- Remaining: live upload (#7), two real Chrome mic + two-person LiveKit rehearsals (#8),
  final demo script + fallback recording + submission (#9). See `README.md`.

## File map
```
src/app/page.tsx            landing
src/app/demo-company/page.tsx FDC company drive (server) — header + DriveExplorer + prompts
src/app/demo-company/DriveExplorer.tsx  searchable list of actual generated PDFs (client)
src/app/room/page.tsx       room (server wrapper)
src/app/room/RoomClient.tsx prejoin + LiveKitRoom + equal-size custom grid (client)
src/app/room/PaigeListener.tsx  Paige's brain (usePaige hook) + PaigeTile/PaigeDock/AnswerChart
src/app/api/token/route.ts  LiveKit JWT minting (server)
src/app/api/tts/route.ts    MiniMax TTS -> MP3 (server)
src/app/api/ask/route.ts    Moss retrieval -> TrueFoundry answer + citations/chart
src/app/api/image/route.ts  Qwen vs MiniMax image race -> winning image bytes (server)
src/app/api/transcribe/route.ts verified LiveKit participant audio -> Deepgram Nova-3
src/lib/paige-answer.ts     grounded answer + conversational fallback + output validation
src/lib/paige-room.ts       shared LiveKit event protocol + session transcript parsing
src/lib/image-race.ts       Qwen/MiniMax race and safe visual prompt builder
src/lib/deepgram-browser.ts local LiveKit mic utterance segmentation
src/lib/deepgram.ts         server-only Deepgram request + response validation
src/lib/minimax-image.ts    MiniMax image-01 client (server-only)
src/data/fdc.ts             shared FDC dashboard and corpus facts
src/lib/room.ts             hardcoded room name "paige-room"
src/lib/env.ts              typed env accessors
scripts/ingest.ts           offline Unsiloed → page chunks → Moss sync + query verification
scripts/ingest-lib.ts       pure page/chunk/citation transforms
scripts/ingest.test.ts      focused ingestion unit tests
scripts/generate-fdc-pdfs.ts reproducible data/fdc PDF generator
scripts/pdf.ts              minimal text-PDF writer used by the demo generator
scripts/test-qwen-image.ts  live z-image-turbo smoke test
src/lib/qwen-image.ts       validated server-only DashScope image client
data/                       corpus PDFs (gitignored), pre-ingested before demo
agent/                      parked Python LiveKit-Agents worker (Deepgram path)
```

## Stack & sponsors
Next.js 16 / React 19 / Tailwind v4 on Vercel. **LiveKit** (room + transport) · **Moss**
(semantic retrieval — the foundation) · **Unsiloed** (PDF parsing) · **MiniMax** (TTS) ·
**Qwen via DashScope** (image generation) · **TrueFoundry** (answer LLM gateway +
fallback) · **Deepgram Nova-3** (STT).

## Env / keys
In `.env` (gitignored). `.env.example` documents all. Deployed ones are also on Vercel
(`vercel env add NAME production` then redeploy).
- `LIVEKIT_URL` / `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — set, on Vercel.
- `MINIMAX_API_KEY` — set, on Vercel (Speech 2.8 HD TTS + optional image endpoint; no GroupId needed).
- `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` — set locally and on Vercel. Ingest + retrieval.
- `UNSILOED_API_KEY` — set (local). PDF parsing.
- `DASHSCOPE_API_KEY` / `QWEN_API_KEY` — Qwen image generation is live-verified through
  Alibaba Model Studio's synchronous `z-image-turbo` endpoint. `bun run qwen:test` saves a
  generated PNG under ignored `data/.qwen-test/`. The key was pasted into an agent chat, so
  rotate it before the final demo deployment.
- `TRUEFOUNDRY_API_KEY` / `TRUEFOUNDRY_BASE_URL` / `TRUEFOUNDRY_MODEL` — configured for
  `openai/gpt-5.4-mini`. Live verification succeeded against `/models` and
  `/chat/completions`. Use TrueFoundry for the answer LLM; MiniMax TTS and Qwen image
  generation remain direct provider integrations.
- `DEEPGRAM_API_KEY` — set locally and on Vercel. Used server-side by
  `/api/transcribe`.

## How to run
- Dev: `npm run dev` → http://localhost:3000. Open `/room` **in Chrome**, allow mic, say
  "Paige, …" or use the chat box.
- `npm run typecheck` · `npm run build`
- Ingest one company: `bun run ingest --company=<folder>` (auto-detects when only one exists)
- Regenerate + ingest FDC: `bun run demo:seed`
- Deploy: `vercel --prod --yes`
- Parked agent: `cd agent && uv sync && uv run agent.py dev` (needs `DEEPGRAM_API_KEY`)

## Gotchas / decisions (will save you time)
1. **Vercel + Moss:** `.vercelignore` must exclude the npm-11 lockfile because Vercel rejects
   it with `npm error Invalid Version`. The Moss native binary also requires a newer
   `libstdc++` than Vercel provides, so `/api/ask` uses Moss's HTTP query API with a ranked
   `getDocs` fallback. Local ingestion continues to use the Moss SDK.
2. **MiniMax TTS needs no GroupId** with this key. `POST api.minimax.io/v1/t2a_v2`, Bearer auth.
3. **Deepgram may hear "Paige" as "page"** → wake matching accepts homophones. Chrome is
   still the demo target because the mic capture path uses `MediaRecorder`.
4. **Don't leave test sessions in `/room`** — they appear as ghost participants. Navigate away
   to an http(s) page to disconnect (the browse tool blocks `about:blank`).
5. **Paige is browser-side** now (not a LiveKit participant). `agent/` is the parked alternative.
6. React StrictMode (dev) double-mounts; the Deepgram recorder cleanup must remain
   idempotent and must never stop the original LiveKit microphone track.
7. **Generated-image text is never evidence.** Qwen and MiniMax can invent labels. Generated
   pixels are blurred and exact cited labels/values render in HTML on top. SVG remains a
   provider-failure fallback.
8. **Google Drive should be an import source, not the live answer path.** Keep Moss as the
   query-time knowledge base. A future "Connect Drive" flow should use OAuth, let a user
   select a folder, parse supported files, and sync page-cited content into Moss.
9. **MiniMax image API:** `POST api.minimax.io/v1/image_generation`, model `image-01`,
   `response_format:"url"`. Result is `data.image_urls[0]` — often **http** (not https) on an
   `*.aliyuncs.com` OSS bucket, content-type `image/jpeg`. The URL validator allows http +
   `.aliyuncs.com` for MiniMax (Qwen stays https + `dashscope-result-*`).
10. **Chart/answer grounding is document-wide for units.** Tables declare the unit once
   ("All currency values are in USD millions"), so the validator checks the unit appears
   somewhere in the cited docs while still requiring the exact value next to its label.
   Wrong scale (millions→billions) still fails because the scale word isn't present.
11. **Paige is not a real LiveKit participant.** Her equal-sized `PaigeTile` is client-side
   composition in the custom grid, not a published track. LiveKit synchronizes her
   presentation and interruption state across browsers. A browser cannot silently start a
   real screen share without a user permission gesture. The real-participant path is still
   parked in `agent/`.

## Demo target
Two people in `/room` on webcams. Open `/demo-company` for the prepared FDC prompts, then:
1. "Paige, what are the key statistics in our latest Q2 report?"
2. "Paige, create a graph comparing Q2 revenue this year and last year."
Paige cites the Q2 2026 preliminary report for the summary, then renders a two-bar chart
using Q2 2026 and Q2 2025 with clickable links to both exact PDF pages.

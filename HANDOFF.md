# Paige — Project Handoff (read this first)

Context for any agent (Codex/Claude) continuing this project. Pairs with `README.md`
(build tracker) and `CLAUDE.md`.

## What Paige is
A **live AI meeting copilot** built for the YC Conversational AI Hackathon (Jun 6–7 2026).
A 3-person LiveKit room (you + a friend + Paige). Paige listens the whole time and only
*acts* when addressed by name ("Paige, …"). On command she retrieves from a **Moss**
semantic index over pre-ingested company financial documents, **speaks** a one-line cited
answer, shows a chart, then a beat later drops a generated image (Qwen vs MiniMax race via
TrueFoundry). Demo-first; protect the "cited answer arriving live" hero beat.

Full approved design/plan (outside the repo): `~/.gstack/projects/paige/stanleyho-unknown-design-20260606-154311.md`

## Status — what's built and working
- **Next.js 16** (App Router, TS, Tailwind v4). Live: **https://paige-beta.vercel.app** ·
  GitHub: **github.com/stananan/paige** (branch `main`) · Vercel project `stananans-projects/paige`.
- `/` landing.
- `/room` — LiveKit room: prejoin (name) → video grid (`GridLayout`+`ParticipantTile`) +
  `ControlBar`. Token minted by `/api/token` (livekit-server-sdk).
- **Paige's voice spine (browser approach):**
  - **Ears (STT):** browser **Web Speech API** (Chrome `webkitSpeechRecognition`) in
    `src/app/room/PaigeListener.tsx`. Continuous; detects wake word "Paige" (accepts
    homophones page/pages/padge/paij); extracts the command after the wake word.
  - **Voice (TTS):** **MiniMax `speech-02-hd`, voice `Wise_Woman`** via `/api/tts`. Plays MP3 in-browser.
  - **Chat box** in the same panel (type to Paige) — shares the `respond()` path.
  - ⚠️ **Current `respond()` is a PLACEHOLDER echo** (`"You asked: <command>"`). This proves
    the spine (task #2). It is NOT the final behavior — replace it in task #4.
- **`agent/`** — a Python **LiveKit-Agents** worker (the original "Paige as a real participant"
  design: Deepgram STT + MiniMax TTS). **PARKED.** We switched to browser STT because Deepgram
  signup was blocked. It's import-verified (livekit-agents 1.5.17) but never run live (needs
  `DEEPGRAM_API_KEY`). Keep as a fallback.

## The real next steps
- **Task #3 — ingest (do first):** flesh out `scripts/ingest.ts` (`bun run ingest`): read PDFs
  from `/data` → **Unsiloed** parse keeping page numbers → chunk with `{sourceFile, page}` →
  index in **Moss**. Verify a raw Moss query returns chunks + source metadata (citations need it).
- **Task #4 — the fast beat (hero):** replace the echo in `PaigeListener.respond()` (move the
  brain server-side, e.g. a `/api/ask` route): command → Moss retrieve → **LLM via TrueFoundry**
  → one-line spoken answer (`/api/tts`) + a cited source card + a chart.
- Then: citations/chart polish (#5), Qwen-vs-MiniMax image race (#6), live upload (#7),
  rehearse (#8), submit (#9). See `README.md` for the full checklist.

## File map
```
src/app/page.tsx            landing
src/app/room/page.tsx       room (server wrapper)
src/app/room/RoomClient.tsx prejoin + LiveKitRoom + video grid (client)
src/app/room/PaigeListener.tsx  Paige's brain (client): Web Speech STT + wake word + chat + TTS playback
src/app/api/token/route.ts  LiveKit JWT minting (server)
src/app/api/tts/route.ts    MiniMax TTS -> MP3 (server)
src/lib/room.ts             hardcoded room name "paige-room"
src/lib/speech.ts           Web Speech API types + factory
src/lib/env.ts              typed env accessors
scripts/ingest.ts           offline ingest STUB (task #3)
data/                       corpus PDFs (gitignored), pre-ingested before demo
agent/                      parked Python LiveKit-Agents worker (Deepgram path)
```

## Stack & sponsors
Next.js 16 / React 19 / Tailwind v4 on Vercel. **LiveKit** (room + transport) · **Moss**
(semantic retrieval — the foundation) · **Unsiloed** (PDF parsing) · **MiniMax** (TTS now,
image later) · **Qwen** (image) · **TrueFoundry** (LLM gateway + fallback) · browser **Web
Speech API** (STT).

## Env / keys
In `.env` (gitignored). `.env.example` documents all. Deployed ones are also on Vercel
(`vercel env add NAME production` then redeploy).
- `LIVEKIT_URL` / `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — set, on Vercel.
- `MINIMAX_API_KEY` — set, on Vercel (TTS + image race; no GroupId needed).
- `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` — set (local). Ingest + retrieval.
- `UNSILOED_API_KEY` — set (local). PDF parsing.
- `QWEN_API_KEY` — set (local). Image race.
- `TRUEFOUNDRY_API_KEY` — set (local). LLM gateway. **`TRUEFOUNDRY_BASE_URL` still MISSING** —
  need the gateway endpoint (~`https://<tenant>.truefoundry.cloud/api/llm`) + a model id from
  the TrueFoundry dashboard before the fast beat.
- `DEEPGRAM_API_KEY` — empty (only if reviving `agent/`).

## How to run
- Dev: `npm run dev` → http://localhost:3000. Open `/room` **in Chrome**, allow mic, say
  "Paige, …" or use the chat box.
- `npm run typecheck` · `npm run build`
- Ingest (task #3): `bun run ingest`
- Deploy: `vercel --prod --yes`
- Parked agent: `cd agent && uv sync && uv run agent.py dev` (needs `DEEPGRAM_API_KEY`)

## Gotchas / decisions (will save you time)
1. **Vercel + lockfile:** Vercel's builder runs an older npm that throws
   `npm error Invalid Version` on our npm-11 `package-lock.json`. `.vercelignore` excludes
   `package-lock.json` so Vercel resolves fresh from `package.json`. **Keep that line.**
   (Proper fix: set the Vercel project's Node version to 24, then restore the lockfile.)
2. **MiniMax TTS needs no GroupId** with this key. `POST api.minimax.io/v1/t2a_v2`, Bearer auth.
3. **Web Speech hears "Paige" as "page"** → wake matching accepts homophones. **Chrome only.**
4. **Don't leave test sessions in `/room`** — they appear as ghost participants. Navigate away
   to an http(s) page to disconnect (the browse tool blocks `about:blank`).
5. **Paige is browser-side** now (not a LiveKit participant). `agent/` is the parked alternative.
6. React StrictMode (dev) double-mounts; `recognition.start()` is guarded with try/catch.

## Demo target
Two people in `/room` on webcams. Someone says "Paige, compare our revenue the last 10 years."
Within ~2s Paige speaks a one-line answer and a cited card/chart appears. A beat later a
generated image appears labeled "generated by Qwen/MiniMax". The loop runs twice without reset.

# Paige agent — LiveKit Agents worker

Paige joins the LiveKit room as a third participant. She hears everything but only
*acts* when addressed by name ("Paige, ..."). Pipeline:

    room audio → Deepgram STT → wake-word "Paige" → MiniMax TTS (she speaks)

The fast beat (task #4) inserts Moss retrieve → LLM (TrueFoundry) before TTS.

## Run

Needs `DEEPGRAM_API_KEY` in the repo-root `.env` (alongside `LIVEKIT_*` and
`MINIMAX_API_KEY`, which are already set).

    cd agent
    uv sync                          # create .venv + install deps (uv manages Python 3.12)
    uv run agent.py download-files   # pre-download VAD + turn-detector models (first run)
    uv run agent.py console          # talk to Paige in the terminal (no room needed)
    uv run agent.py dev              # run the worker; Paige joins the LiveKit room

With the worker running, open the web app's `/room` in two tabs — Paige is the
third participant. Say "Paige, hello" and she speaks back. **Time the round-trip.**

## Notes
- STT/TTS run on **our** keys (Deepgram + MiniMax plugins), not LiveKit's billed inference gateway.
- No LLM yet — task #2 only echoes a fixed line. The LLM (via TrueFoundry) arrives with the fast beat.
- Models (Silero VAD, multilingual turn detector) download on first run via `download-files`.

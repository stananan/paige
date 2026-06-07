import logging
import os

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    StopResponse,
    cli,
)
from livekit.plugins import deepgram, minimax, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("paige")

# Share the Next.js app's .env (LIVEKIT_*, DEEPGRAM_API_KEY, MINIMAX_API_KEY).
load_dotenv(os.path.join(os.path.dirname(__file__), os.pardir, ".env"))

WAKE_WORD = "paige"


class Paige(Agent):
    """Addressed activation: Paige hears everything but only *acts* when called
    by name ("Paige, ..."). This kills the 'agent talks over you' failure mode
    and keeps the demo controllable on stage."""

    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are Paige, a live meeting copilot. You only respond when "
                "addressed by name. Keep spoken replies to one short sentence."
            ),
        )

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        said = (getattr(new_message, "text_content", "") or "").lower()
        if WAKE_WORD not in said:
            raise StopResponse()  # not addressed -> stay silent

        # Task #2: prove the STT -> wake-word -> TTS round-trip with a fixed reply.
        # The fast beat (task #4) swaps this for: Moss retrieve -> LLM (TrueFoundry)
        # -> spoken cited answer + a chart pushed over a LiveKit data channel.
        await self.session.say("Hi, I'm Paige. I'm listening.")
        raise StopResponse()


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="paige")
async def paige_agent(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    session = AgentSession(
        # STT/TTS run on OUR keys (not LiveKit's billed inference gateway).
        stt=deepgram.STT(model="nova-3", language="en"),
        tts=minimax.TTS(model="speech-02-hd", voice_id="Wise_Woman"),
        vad=ctx.proc.userdata["vad"],
        turn_detection=MultilingualModel(),
        # No LLM yet: task #2 only echoes. The fast beat adds the LLM via TrueFoundry.
    )

    await session.start(agent=Paige(), room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)

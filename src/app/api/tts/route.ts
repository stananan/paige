import { NextRequest, NextResponse } from "next/server";

// Paige's voice. Synthesize text -> speech via MiniMax T2A v2 and return raw MP3
// so the browser can play it directly (new Audio(url) or an <audio> element).
// Verified: our MINIMAX_API_KEY works without a GroupId.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINIMAX_T2A = "https://api.minimax.io/v1/t2a_v2";
const PAIGE_MODEL = "speech-2.8-hd";
const PAIGE_VOICE = "English_radiant_girl";
const PAIGE_SPEED = 1.2;

export async function POST(req: NextRequest) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not set" }, { status: 500 });
  }

  let text = "";
  let voiceId = PAIGE_VOICE;
  try {
    const body = await req.json();
    text = String(body.text ?? "").trim();
    if (body.voiceId) voiceId = String(body.voiceId);
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { text }" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "Missing 'text'" }, { status: 400 });
  }

  const mm = await fetch(MINIMAX_T2A, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PAIGE_MODEL,
      text,
      stream: false,
      language_boost: "English",
      output_format: "hex",
      voice_setting: { voice_id: voiceId, speed: PAIGE_SPEED, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
    }),
  });

  const data = await mm.json();
  const hex: string | undefined = data?.data?.audio;
  if (!hex || data?.base_resp?.status_code !== 0) {
    return NextResponse.json(
      { error: "MiniMax synthesis failed", detail: data?.base_resp },
      { status: 502 },
    );
  }

  return new NextResponse(Buffer.from(hex, "hex"), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

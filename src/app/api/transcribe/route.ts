import { TokenVerifier } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { transcribeDeepgramAudio } from "@/lib/deepgram";
import { PAIGE_ROOM } from "@/lib/room";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

async function verifiedSpeaker(request: NextRequest): Promise<string | null> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const authorization = request.headers.get("authorization");
  if (!apiKey || !apiSecret || !authorization?.startsWith("Bearer ")) return null;

  try {
    const claims = await new TokenVerifier(apiKey, apiSecret).verify(
      authorization.slice(7),
    );
    if (!claims.video?.roomJoin || claims.video.room !== PAIGE_ROOM) return null;
    return claims.name?.trim() || claims.sub?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const speaker = await verifiedSpeaker(request);
  if (!speaker) {
    return NextResponse.json({ error: "Invalid meeting credential" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio payload is too large" }, { status: 413 });
  }

  try {
    const audio = new Uint8Array(await request.arrayBuffer());
    const result = await transcribeDeepgramAudio(
      audio,
      request.headers.get("content-type") || "application/octet-stream",
    );
    return NextResponse.json(
      { ...result, speaker },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (reason) {
    console.error("[api/transcribe] Deepgram failed", reason);
    return NextResponse.json(
      { error: "Paige couldn't transcribe that audio." },
      { status: 502 },
    );
  }
}

import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { PAIGE_ROOM } from "@/lib/room";

// Mint a short-lived LiveKit access token for a participant. Secrets stay here
// on the server; the browser only ever receives the token + the wss server URL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json(
      { error: "LiveKit not configured (LIVEKIT_API_KEY/SECRET, NEXT_PUBLIC_LIVEKIT_URL)" },
      { status: 500 },
    );
  }

  const params = req.nextUrl.searchParams;
  const room = params.get("room") || PAIGE_ROOM;
  const username =
    params.get("username")?.trim() || `guest-${Math.random().toString(36).slice(2, 7)}`;

  const at = new AccessToken(apiKey, apiSecret, { identity: username, name: username });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true, // Paige will push cited cards over a data channel later
  });

  return NextResponse.json({ token: await at.toJwt(), serverUrl, room, identity: username });
}

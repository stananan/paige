import { NextRequest, NextResponse } from "next/server";
import { buildIllustrationPrompt, raceImageProviders } from "@/lib/image-race";

// Paige's "slow beat": a generated illustration that arrives after the spoken,
// cited answer. Qwen and MiniMax race; the first valid image wins. If both fail the
// client simply keeps the cited card/chart, so this route is best-effort by design.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOPIC_LENGTH = 500;
const MAX_BODY_BYTES = 4_096;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let topic: string;
  try {
    const body = (await request.json()) as { topic?: unknown };
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { topic }" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    topic = topic.slice(0, MAX_TOPIC_LENGTH);
  }

  try {
    const image = await raceImageProviders(buildIllustrationPrompt(topic));
    return NextResponse.json(
      { dataUrl: image.dataUrl, model: image.model, requestId: image.requestId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/image] all providers failed", error);
    return NextResponse.json(
      { error: "Paige couldn't generate an image right now." },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  buildPresentationImagePrompt,
  generatePresentationImage,
} from "@/lib/presentation-image";
import {
  visualRequiresChart,
  type VisualRequestKind,
} from "@/lib/visual-intent";

// Paige's "slow beat": a generated illustration that arrives after the spoken,
// cited answer. MiniMax creates the backdrop while exact values remain in HTML.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TOPIC_LENGTH = 500;
const MAX_BODY_BYTES = 8_192;

function parsedChart(value: unknown): {
  title: string;
  labels: string[];
  values: number[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const chart = value as Record<string, unknown>;
  if (
    typeof chart.title !== "string" ||
    !Array.isArray(chart.labels) ||
    !chart.labels.every((label) => typeof label === "string") ||
    !Array.isArray(chart.values) ||
    !chart.values.every((number) => typeof number === "number") ||
    chart.labels.length !== chart.values.length ||
    chart.values.length > 12
  ) {
    return null;
  }
  return {
    title: chart.title.slice(0, 160),
    labels: chart.labels.map((label) => label.slice(0, 80)),
    values: chart.values,
  };
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let topic: string;
  let answer: string;
  let kind: VisualRequestKind;
  let chart: ReturnType<typeof parsedChart>;
  try {
    const body = (await request.json()) as {
      topic?: unknown;
      answer?: unknown;
      kind?: unknown;
      chart?: unknown;
    };
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
    answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 600) : "";
    if (body.kind !== "data" && body.kind !== "creative") {
      return NextResponse.json({ error: "Invalid visual kind" }, { status: 400 });
    }
    kind = body.kind;
    chart = parsedChart(body.chart);
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON: { topic, answer, kind, chart? }" },
      { status: 400 },
    );
  }

  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    topic = topic.slice(0, MAX_TOPIC_LENGTH);
  }
  if (kind === "data" && visualRequiresChart(topic) && !chart) {
    return NextResponse.json(
      { error: "Numeric visuals require source-verified chart data" },
      { status: 422 },
    );
  }

  try {
    const image = await generatePresentationImage(
      buildPresentationImagePrompt({ topic, answer, kind, chart }),
      { signal: request.signal },
    );
    const bytes = Uint8Array.from(image.bytes).buffer;
    return new Response(bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Paige-Image-Model": image.model,
        "X-Paige-Image-Request-Id": image.requestId,
      },
    });
  } catch (error) {
    console.error("[api/image] MiniMax generation failed", error);
    return NextResponse.json(
      { error: "Paige couldn't generate an image right now." },
      { status: 502 },
    );
  }
}

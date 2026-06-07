import { NextRequest, NextResponse } from "next/server";
import {
  askPaige,
  type PaigeConversationTurn,
} from "@/lib/paige-answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_QUESTION_LENGTH = 500;
const MAX_BODY_BYTES = 16_384;
const MAX_HISTORY_TURNS = 6;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_TRACKED_CLIENTS = 1_000;
const requestsByClient = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function isRateLimited(key: string, now = Date.now()): boolean {
  const current = requestsByClient.get(key);
  if (!current || current.resetAt <= now) {
    if (!current && requestsByClient.size >= MAX_TRACKED_CLIENTS) {
      for (const [client, entry] of requestsByClient) {
        if (entry.resetAt <= now) requestsByClient.delete(client);
      }
      while (requestsByClient.size >= MAX_TRACKED_CLIENTS) {
        const oldest = requestsByClient.keys().next().value;
        if (oldest === undefined) break;
        requestsByClient.delete(oldest);
      }
    }
    requestsByClient.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  if (isRateLimited(clientKey(request))) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let question: string;
  let history: PaigeConversationTurn[] = [];
  try {
    const body = (await request.json()) as {
      question?: unknown;
      history?: unknown;
    };
    question = typeof body.question === "string" ? body.question.trim() : "";
    if (body.history !== undefined) {
      if (
        !Array.isArray(body.history) ||
        body.history.length > MAX_HISTORY_TURNS ||
        !body.history.every(
          (turn) =>
            typeof turn === "object" &&
            turn !== null &&
            "question" in turn &&
            typeof turn.question === "string" &&
            turn.question.length <= MAX_QUESTION_LENGTH &&
            "answer" in turn &&
            typeof turn.answer === "string" &&
            turn.answer.length <= 600,
        )
      ) {
        return NextResponse.json({ error: "Invalid conversation history" }, { status: 400 });
      }
      history = body.history.map((turn) => ({
        question: String(turn.question).trim(),
        answer: String(turn.answer).trim(),
      }));
    }
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON: { question, history? }" },
      { status: 400 },
    );
  }

  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const answer = await askPaige(question, {
      signal: request.signal,
      history,
    });
    return NextResponse.json(answer, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/ask] failed", error);
    return NextResponse.json(
      { error: "Paige couldn't retrieve an answer. Please try again." },
      { status: 502 },
    );
  }
}

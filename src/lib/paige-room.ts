import type { PaigeAnswer, PaigeConversationTurn } from "./paige-answer";

export const PAIGE_DATA_TOPIC = "paige.room.v1";
export const PAIGE_IMAGE_TOPIC = "paige.image.v1";
export const MAX_SHARED_HISTORY = 6;

interface PaigeEventBase {
  version: 1;
  eventId: string;
  at: number;
  by: string;
}

export type PaigeRoomEvent =
  | (PaigeEventBase & {
      type: "session";
      active: boolean;
    })
  | (PaigeEventBase & {
      type: "transcript";
      speaker: string;
      text: string;
    })
  | (PaigeEventBase & {
      type: "thinking";
      interactionId: string;
      question: string;
      speaker: string;
      sessionActive: boolean;
    })
  | (PaigeEventBase & {
      type: "answer";
      interactionId: string;
      question: string;
      speaker: string;
      answer: PaigeAnswer;
      sessionActive: boolean;
    })
  | (PaigeEventBase & {
      type: "interrupt";
      interactionId?: string;
    })
  | (PaigeEventBase & {
      type: "image";
      interactionId: string;
      status: "ready" | "failed";
      model?: string;
      imageName?: string;
    })
  | (PaigeEventBase & {
      type: "state-request";
    })
  | (PaigeEventBase & {
      type: "snapshot";
      sessionActive: boolean;
      currentInteractionId: string;
      question: string;
      answer: PaigeAnswer | null;
      history: PaigeConversationTurn[];
      updatedAt: number;
      speaker: string;
      imageName?: string;
      imageStatus?: "loading" | "ready" | "failed";
    });

export type PaigeTranscriptIntent =
  | { type: "ignore" }
  | { type: "activate" }
  | { type: "ask"; command: string; activate: boolean }
  | { type: "end" };

const WAKE_WORD = /\b(?:paige|pages|page|padge|paij)\b/i;
const END_SESSION =
  /\b(?:thank you|thanks)\s+(?:paige|pages|page|padge|paij)\b|\b(?:that(?:'s| is) it|we(?:'re| are) done|stop listening)(?:\s+(?:paige|pages|page|padge|paij))?\b/i;
const MIN_SUBSTANTIVE_WORDS = 3;
const CASUAL_ONLY =
  /^(?:u+h+|u+m+|h+m+|m+h+m+|yeah|yep|yes|no|okay|ok|right|sure|cool|great|nice|wow|exactly|agreed|interesting|got it|i see|i agree|i understand|that makes sense|that(?:'s| is) (?:interesting|helpful|good|great|right)|sounds good|fair enough|you know|let(?:'s| us) see)[.!?,\s]*$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeCitationUrl(value: unknown): value is string | undefined {
  if (value === undefined) return true;
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return false;
  }
  try {
    const url = new URL(value, "https://paige.local");
    return (
      url.origin === "https://paige.local" &&
      url.pathname.toLowerCase().endsWith(".pdf") &&
      !decodeURIComponent(url.pathname).split("/").includes("..")
    );
  } catch {
    return false;
  }
}

function isPaigeAnswer(value: unknown): value is PaigeAnswer {
  if (!isRecord(value)) return false;
  return (
    typeof value.answer === "string" &&
    Array.isArray(value.citations) &&
    value.citations.every(
      (citation) =>
        isRecord(citation) &&
        typeof citation.sourceFile === "string" &&
        typeof citation.page === "string" &&
        isSafeCitationUrl(citation.url),
    ) &&
    (value.chart === null ||
      (isRecord(value.chart) &&
        typeof value.chart.title === "string" &&
        Array.isArray(value.chart.labels) &&
        value.chart.labels.every((label) => typeof label === "string") &&
        Array.isArray(value.chart.values) &&
        value.chart.values.every((number) => typeof number === "number") &&
        typeof value.chart.unit === "string")) &&
    typeof value.model === "string"
  );
}

function isHistory(value: unknown): value is PaigeConversationTurn[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_SHARED_HISTORY &&
    value.every(
      (turn) =>
        isRecord(turn) &&
        typeof turn.question === "string" &&
        typeof turn.answer === "string",
    )
  );
}

export function encodePaigeRoomEvent(event: PaigeRoomEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event));
}

export function decodePaigeRoomEvent(payload: Uint8Array): PaigeRoomEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.type !== "string" ||
    typeof value.eventId !== "string" ||
    typeof value.at !== "number" ||
    typeof value.by !== "string"
  ) {
    return null;
  }

  if (value.type === "session" && typeof value.active === "boolean") {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "transcript" &&
    typeof value.speaker === "string" &&
    typeof value.text === "string"
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "thinking" &&
    typeof value.interactionId === "string" &&
    typeof value.question === "string" &&
    typeof value.speaker === "string" &&
    typeof value.sessionActive === "boolean"
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "answer" &&
    typeof value.interactionId === "string" &&
    typeof value.question === "string" &&
    typeof value.speaker === "string" &&
    isPaigeAnswer(value.answer) &&
    typeof value.sessionActive === "boolean"
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "interrupt" &&
    (value.interactionId === undefined || typeof value.interactionId === "string")
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "image" &&
    typeof value.interactionId === "string" &&
    (value.status === "ready" || value.status === "failed") &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.imageName === undefined || typeof value.imageName === "string")
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  if (value.type === "state-request") {
    return value as unknown as PaigeRoomEvent;
  }
  if (
    value.type === "snapshot" &&
    typeof value.sessionActive === "boolean" &&
    typeof value.currentInteractionId === "string" &&
    typeof value.question === "string" &&
    (value.answer === null || isPaigeAnswer(value.answer)) &&
    isHistory(value.history) &&
    typeof value.updatedAt === "number" &&
    typeof value.speaker === "string" &&
    (value.imageName === undefined || typeof value.imageName === "string") &&
    (value.imageStatus === undefined ||
      value.imageStatus === "loading" ||
      value.imageStatus === "ready" ||
      value.imageStatus === "failed")
  ) {
    return value as unknown as PaigeRoomEvent;
  }
  return null;
}

export function transcriptIntent(
  transcript: string,
  sessionActive: boolean,
  minimumWords = MIN_SUBSTANTIVE_WORDS,
): PaigeTranscriptIntent {
  const normalized = transcript.trim();
  if (!normalized) return { type: "ignore" };
  if (END_SESSION.test(normalized)) return { type: "end" };

  const wake = WAKE_WORD.exec(normalized);
  if (!sessionActive && !wake) return { type: "ignore" };
  if (wake) {
    const command = normalized
      .slice((wake.index ?? 0) + wake[0].length)
      .replace(/^[\s,.:!?-]+/, "")
      .trim();
    return command && transcriptWordCount(normalized) >= minimumWords
      ? { type: "ask", command, activate: !sessionActive }
      : { type: "activate" };
  }
  if (!isSubstantiveTranscript(normalized, minimumWords)) {
    return { type: "ignore" };
  }
  return { type: "ask", command: normalized, activate: false };
}

export function transcriptWordCount(transcript: string): number {
  return transcript
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

export function isSubstantiveTranscript(
  transcript: string,
  minimumWords = MIN_SUBSTANTIVE_WORDS,
): boolean {
  const normalized = transcript.trim();
  return (
    transcriptWordCount(normalized) >= minimumWords &&
    !CASUAL_ONLY.test(normalized)
  );
}

export function shouldGenerateVisual(
  question: string,
  answer: Pick<PaigeAnswer, "chart" | "citations">,
): boolean {
  if (answer.chart) return true;
  return Boolean(
    answer.citations.length > 0 &&
      /\b(?:visual|visuali[sz]e|chart|graph|plot|diagram|graphic|illustration|image|picture|compare|comparison|trend)\b/i.test(
        question,
      ),
  );
}

export function appendConversationTurn(
  history: PaigeConversationTurn[],
  turn: PaigeConversationTurn,
): PaigeConversationTurn[] {
  return [...history, turn].slice(-MAX_SHARED_HISTORY);
}

export function sharedImageFileName(
  interactionId: string,
  model: string,
  contentType: string,
): string {
  const extension = contentType.includes("png") ? "png" : "jpg";
  const safeModel = model.replace(/[^a-z0-9-]+/gi, "-").slice(0, 32);
  return `${interactionId}--${safeModel}.${extension}`;
}

export function interactionIdFromImageName(name: string): string | null {
  const separator = name.indexOf("--");
  return separator > 0 ? name.slice(0, separator) : null;
}

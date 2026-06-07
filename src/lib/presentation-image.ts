// Server-only presentation image generation. MiniMax is intentionally the only
// provider here: in live comparison it followed the no-text constraint while
// Qwen added fabricated chart labels and values.

import { generateMiniMaxImage } from "./minimax-image";
import type { VisualRequestKind } from "./visual-intent";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Environment = Record<string, string | undefined>;

export interface PresentationImage {
  bytes: Uint8Array;
  contentType: string;
  model: "MiniMax image-01";
  requestId: string;
}

export interface PresentationImageDependencies {
  environment?: Environment;
  fetchImpl?: Fetch;
  signal?: AbortSignal;
}

const MAX_TOPIC_CHARACTERS = 240;
const ATTEMPT_TIMEOUT_MS = 55_000;
const MAX_ATTEMPTS = 2;

export interface PresentationImagePromptInput {
  topic: string;
  answer?: string;
  kind: VisualRequestKind;
  chart?: { labels: string[]; values: number[]; title: string } | null;
}

function cleanedText(value: string, removeNumbers: boolean): string {
  const normalized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  if (!removeNumbers) return normalized.slice(0, MAX_TOPIC_CHARACTERS);
  return normalized
    .replace(/\bQ[1-4]\b/gi, "quarter")
    .replace(/[$€£]?\d[\d,.]*(?:%|[KMB])?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOPIC_CHARACTERS);
}

function dataMotif(subject: string): string {
  if (/\b(?:operating income|profit|profitability)\b/i.test(subject)) {
    return "a real multi-location operations team moving from cost pressure into healthy, efficient execution";
  }
  if (/\b(?:revenue|arr|bookings|sales|pipeline|cash)\b/i.test(subject)) {
    return "connected retail and field-service operations expanding through warehouse inventory, dispatch vehicles, field teams, and customer activity";
  }
  if (/\b(?:margin|retention|nrr|churn)\b/i.test(subject)) {
    return "efficient operations and durable customer relationships across a connected service network";
  }
  if (/\b(?:customer|renewal|account)\b/i.test(subject)) {
    return "a connected network of customers and storefront operations with visible activity and collaboration";
  }
  if (/\b(?:security|compliance|incident|risk)\b/i.test(subject)) {
    return "resilient digital infrastructure, protection, and risk containment expressed with shield-like geometry and connected systems";
  }
  if (/\b(?:support|ticket|csat|sla)\b/i.test(subject)) {
    return "a modern service operations center with coordinated support flows and clear operational movement";
  }
  return "a concrete, subject-specific scene inside a modern distributed business";
}

/**
 * Build a subject-specific, label-free visual. Exact chart values remain in
 * the app's HTML overlay so generated pixels can never become evidence.
 */
export function buildPresentationImagePrompt(
  input: PresentationImagePromptInput,
): string {
  if (input.kind === "creative") {
    const subject =
      cleanedText(input.topic, false).replace(
        /^(?:please\s+)?(?:draw|sketch|illustrate|render|paint|design|create|generate|make|visuali[sz]e|show|picture)\s+(?:me\s+)?(?:an?\s+)?/i,
        "",
      ) || "a modern company meeting";
    // The grounded answer (TrueFoundry over the retrieved PDFs) describes what the
    // subject actually contains, so the illustration reflects real company content
    // instead of an unrelated scene. Numbers are stripped: creative visuals have no
    // HTML overlay, so the model must never try to paint figures.
    const grounding = cleanedText(input.answer ?? "", true);
    return [
      `Create one polished horizontal 16:9 editorial illustration showing this exact subject: ${subject}.`,
      grounding
        ? `Ground the scene literally in this real context, depicting what it describes: ${grounding}.`
        : "",
      "Subject relevance is mandatory. Follow the requested scene literally and make the central objects immediately recognizable.",
      "Do not replace the subject with generic abstract waves, generic finance imagery, an unrelated boardroom, houses, mansions, or landscapes.",
      "Premium cinematic composition, strong depth, natural detail, balanced framing, and generous safe margins.",
      "No text, words, letters, numbers, logos, watermarks, captions, or UI.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const chartSubject = cleanedText(input.chart?.title ?? "", true);
  const answerSubject = cleanedText(input.answer ?? "", true);
  const topicSubject = cleanedText(input.topic, true);
  const supportingSubject = input.chart ? topicSubject : answerSubject || topicSubject;
  const subject = [chartSubject, supportingSubject].filter(Boolean).join(". ");

  return [
    `Create one polished horizontal 16:9 editorial data illustration about: ${subject || "company performance"}.`,
    `Subject relevance is mandatory: show ${dataMotif(subject)}.`,
    "Create a concrete contextual scene, not a chart. Do not depict bars, columns, lines, graph axes, dashboards, tables, gauges, or any countable data marks.",
    "Keep the center and lower third visually calm and uncluttered so the application can place its source-verified chart there.",
    "Use a premium deep-navy palette with cyan and emerald accents, cinematic soft depth, strong contrast, balanced composition, and generous safe margins.",
    "This generated image is context only, never the evidence layer.",
    "Avoid storefront signs, billboards, screens, and packaging. Do not include text, words, letters, numbers, labels, logos, watermarks, or UI.",
    "The application will place the verified source labels and exact values over this image.",
  ].join(" ");
}

function combinedAttemptSignal(parent?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function isPermanentFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Missing MINIMAX_API_KEY|prompt is required|characters or fewer|aspect ratio is not supported|auth failed/i.test(
    message,
  );
}

export async function generatePresentationImage(
  prompt: string,
  dependencies: PresentationImageDependencies = {},
): Promise<PresentationImage> {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let latestError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    try {
      const result = await generateMiniMaxImage(
        { prompt, aspectRatio: "16:9", promptOptimizer: false },
        {
          environment,
          fetchImpl,
          signal: combinedAttemptSignal(dependencies.signal),
        },
      );
      return {
        bytes: result.bytes,
        contentType: result.contentType,
        model: "MiniMax image-01",
        requestId: result.requestId,
      };
    } catch (error) {
      latestError = error;
      if (isPermanentFailure(error)) break;
    }
  }

  const message = latestError instanceof Error ? latestError.message : String(latestError);
  throw new Error(`MiniMax presentation image failed after retry: ${message}`);
}

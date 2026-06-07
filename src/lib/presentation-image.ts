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
    return "a clear transition from pressure below a baseline into healthy positive performance, expressed as dimensional glass forms";
  }
  if (/\b(?:revenue|arr|bookings|sales|pipeline|cash)\b/i.test(subject)) {
    return "disciplined business growth expressed through luminous architectural columns and flowing financial momentum";
  }
  if (/\b(?:margin|retention|nrr|churn)\b/i.test(subject)) {
    return "operating efficiency and durable customer retention expressed through layered loops and stable rising forms";
  }
  if (/\b(?:customer|renewal|account)\b/i.test(subject)) {
    return "a connected network of customers and storefront operations with clear differences in scale and health";
  }
  if (/\b(?:security|compliance|incident|risk)\b/i.test(subject)) {
    return "resilient digital infrastructure, protection, and risk containment expressed with shield-like geometry and connected systems";
  }
  if (/\b(?:support|ticket|csat|sla)\b/i.test(subject)) {
    return "a modern service operations center with coordinated support flows and clear operational movement";
  }
  return "a concrete, subject-specific business scene expressed through dimensional data forms";
}

function chartDirection(values: number[]): string {
  if (values.length < 2) return "Show one clear focal data form.";
  const comparisons = values.slice(1).map((value, index) => value - values[index]);
  const rises =
    comparisons.every((difference) => difference >= 0) &&
    comparisons.some((difference) => difference > 0);
  const falls =
    comparisons.every((difference) => difference <= 0) &&
    comparisons.some((difference) => difference < 0);
  const level = comparisons.every((difference) => difference === 0);
  const crossesZero = values.some((value) => value < 0) && values.some((value) => value >= 0);
  const count =
    ["one", "two", "three", "four", "five", "six", "seven", "eight"][values.length - 1] ??
    "several";

  if (crossesZero) {
    return `Use ${count} prominent unlabeled data forms in source order, visibly crossing from below a central baseline to above it.`;
  }
  if (rises) {
    return `Use ${count} prominent unlabeled data forms in source order with a clear left-to-right upward progression.`;
  }
  if (falls) {
    return `Use ${count} prominent unlabeled data forms in source order with a clear left-to-right downward progression.`;
  }
  if (level) {
    return `Use ${count} prominent unlabeled data forms in source order at matching heights to communicate stable performance.`;
  }
  return `Use ${count} prominent unlabeled data forms with visibly varied heights and a balanced left-to-right comparison.`;
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
        /^(?:please\s+)?(?:draw|sketch|illustrate|render|paint|design|create|generate|make)\s+(?:an?\s+)?/i,
        "",
      ) || "a modern company meeting";
    return [
      `Create one polished horizontal 16:9 editorial illustration showing this exact subject: ${subject}.`,
      "Subject relevance is mandatory. Follow the requested scene literally and make the central objects immediately recognizable.",
      "Do not replace the subject with generic abstract waves, generic finance imagery, or an unrelated boardroom.",
      "Premium cinematic composition, strong depth, natural detail, balanced framing, and generous safe margins.",
      "No text, words, letters, numbers, logos, watermarks, captions, or UI.",
    ].join(" ");
  }

  const chartSubject = cleanedText(input.chart?.title ?? "", true);
  const answerSubject = cleanedText(input.answer ?? "", true);
  const topicSubject = cleanedText(input.topic, true);
  const supportingSubject = input.chart ? topicSubject : answerSubject || topicSubject;
  const subject = [chartSubject, supportingSubject].filter(Boolean).join(". ");
  const chartComposition =
    input.chart && input.chart.values.length > 0
      ? chartDirection(input.chart.values)
      : "Create one clear focal composition that directly communicates the retrieved business subject.";

  return [
    `Create one polished horizontal 16:9 editorial data illustration about: ${subject || "company performance"}.`,
    `Subject relevance is mandatory: show ${dataMotif(subject)}.`,
    chartComposition,
    "Use a premium deep-navy palette with cyan and emerald accents, cinematic soft depth, strong contrast, balanced composition, and generous safe margins.",
    "This is a visual metaphor, not the evidence layer. Do not add axes, legends, tables, dashboards, or extra data series.",
    "Do not include text, words, letters, numbers, labels, logos, watermarks, or UI.",
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
        { prompt, aspectRatio: "16:9" },
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

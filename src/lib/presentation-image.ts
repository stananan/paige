// Server-only presentation image generation. MiniMax is intentionally the only
// provider here: in live comparison it followed the no-text constraint while
// Qwen added fabricated chart labels and values.

import { generateMiniMaxImage } from "./minimax-image";

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

/**
 * Build a restrained, label-free backdrop. Exact chart values remain in the
 * app's HTML overlay so generated pixels can never become evidence.
 */
export function buildPresentationImagePrompt(
  topic: string,
  chart?: { labels: string[]; values: number[]; title: string } | null,
): string {
  const cleaned = topic
    .replace(/\bQ[1-4]\b/gi, "quarter")
    .replace(/[$€£]?\d[\d,.]*(?:%|[KMB])?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOPIC_CHARACTERS);
  const subject = cleaned || "a modern company meeting";
  const composition =
    chart && chart.values.length > 0
      ? "Use dimensional data-inspired forms and upward visual rhythm, but do not draw a literal chart, graph, dashboard, table, bars with scales, axes, or legends."
      : "Use a polished abstract editorial composition with clean geometric forms.";

  return [
    `Create one polished horizontal 16:9 executive presentation background inspired by: ${subject}.`,
    composition,
    "Premium boardroom aesthetic, deep navy with cyan and emerald accents, cinematic soft depth, strong contrast, balanced composition, and generous safe margins.",
    "Do not include text, words, letters, numbers, labels, logos, watermarks, or UI.",
    "The application will place verified source data over this background.",
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

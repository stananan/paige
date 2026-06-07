// Qwen vs MiniMax image race. Both providers start at once; the first valid image
// wins and the loser is aborted. If every configured provider fails, this throws and
// the caller keeps its deterministic chart fallback. Server-only (carries API keys).

import { generateMiniMaxImage } from "./minimax-image";
import { generateQwenImage } from "./qwen-image";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Environment = Record<string, string | undefined>;

export type ImageProvider = "Qwen" | "MiniMax";

export interface RacedImage {
  bytes: Uint8Array;
  contentType: string;
  model: ImageProvider;
  requestId: string;
}

export interface ImageRaceDependencies {
  environment?: Environment;
  fetchImpl?: Fetch;
}

const MAX_TOPIC_CHARACTERS = 240;

/**
 * Turn a spoken request into a safe, label-free data-visual prompt. Exact source
 * values are rendered by the app as HTML over the image, never by the image model.
 */
export function buildIllustrationPrompt(
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
      ? `Use a polished executive data-visualization composition with exactly ${chart.values.length} unlabeled vertical forms and clear visual hierarchy.`
      : "Use a polished executive data-visualization composition with clean geometric forms.";
  return [
    `Create a clean, modern editorial visual that evokes: ${subject}.`,
    composition,
    "Calm professional palette, strong contrast, soft depth, premium boardroom presentation style.",
    "No text, no words, no letters, no numbers, no axis labels, no logos.",
  ].join(" ");
}

function hasQwenKey(environment: Environment): boolean {
  return Boolean(environment.DASHSCOPE_API_KEY?.trim() || environment.QWEN_API_KEY?.trim());
}

function hasMiniMaxKey(environment: Environment): boolean {
  return Boolean(environment.MINIMAX_API_KEY?.trim());
}

export function configuredImageProviders(environment: Environment): ImageProvider[] {
  const providers: ImageProvider[] = [];
  if (hasQwenKey(environment)) providers.push("Qwen");
  if (hasMiniMaxKey(environment)) providers.push("MiniMax");
  return providers;
}

export async function raceImageProviders(
  prompt: string,
  dependencies: ImageRaceDependencies = {},
): Promise<RacedImage> {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const controller = new AbortController();

  const contenders: Promise<RacedImage>[] = [];
  if (hasQwenKey(environment)) {
    contenders.push(
      generateQwenImage(
        { prompt },
        { environment, fetchImpl, signal: controller.signal },
      ).then((result) => ({
        bytes: result.bytes,
        contentType: result.contentType,
        model: "Qwen" as const,
        requestId: result.requestId,
      })),
    );
  }
  if (hasMiniMaxKey(environment)) {
    contenders.push(
      generateMiniMaxImage(
        { prompt },
        { environment, fetchImpl, signal: controller.signal },
      ).then((result) => ({
        bytes: result.bytes,
        contentType: result.contentType,
        model: "MiniMax" as const,
        requestId: result.requestId,
      })),
    );
  }

  if (contenders.length === 0) {
    throw new Error("No image provider is configured (set DASHSCOPE_API_KEY or MINIMAX_API_KEY)");
  }

  try {
    const winner = await Promise.any(contenders);
    controller.abort(); // stop the slower provider; its result is no longer needed
    return winner;
  } catch (error) {
    controller.abort();
    if (error instanceof AggregateError) {
      const reason = error.errors
        .map((item) => (item instanceof Error ? item.message : String(item)))
        .join("; ");
      throw new Error(`All image providers failed: ${reason}`);
    }
    throw error;
  }
}

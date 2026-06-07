// Qwen vs MiniMax image race. Both providers start at once; the first valid image
// wins and the loser is aborted. If every configured provider fails, this throws and
// the caller keeps its deterministic chart fallback. Server-only (carries API keys).

import { generateMiniMaxImage } from "./minimax-image";
import { generateQwenImage } from "./qwen-image";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Environment = Record<string, string | undefined>;

export type ImageProvider = "Qwen" | "MiniMax";

export interface RacedImage {
  /** A self-contained data: URL so the browser needs no second request. */
  dataUrl: string;
  model: ImageProvider;
  requestId: string;
}

export interface ImageRaceDependencies {
  environment?: Environment;
  fetchImpl?: Fetch;
}

const MAX_TOPIC_CHARACTERS = 240;

/**
 * Turn a spoken answer or question into a safe, label-free illustration prompt.
 * The generated image is a flourish, never evidence — so we keep it abstract and
 * explicitly free of text, numbers, and charts (which models render unreliably).
 */
export function buildIllustrationPrompt(topic: string): string {
  const cleaned = topic.replace(/\s+/g, " ").trim().slice(0, MAX_TOPIC_CHARACTERS);
  const subject = cleaned || "a modern company meeting";
  return [
    `A clean, modern editorial illustration that evokes: ${subject}.`,
    "Calm professional palette, soft depth, abstract and conceptual.",
    "No text, no words, no letters, no numbers, no charts, no graphs, no logos.",
  ].join(" ");
}

function toDataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
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
        dataUrl: toDataUrl(result.bytes, result.contentType),
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
        dataUrl: toDataUrl(result.bytes, result.contentType),
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

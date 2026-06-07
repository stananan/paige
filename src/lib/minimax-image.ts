// Server-only MiniMax image client (model image-01). Mirrors qwen-image.ts so the
// two can race head-to-head. Never import from client code — it carries the API key.

const MINIMAX_IMAGE_ENDPOINT = "https://api.minimax.io/v1/image_generation";
const MINIMAX_IMAGE_MODEL = "image-01";
const DEFAULT_ASPECT_RATIO = "1:1";
const ALLOWED_ASPECT_RATIOS = new Set([
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
]);
const MAX_PROMPT_CHARACTERS = 1500;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface MiniMaxImageInput {
  prompt: string;
  aspectRatio?: string;
}

export interface MiniMaxImageResult {
  bytes: Uint8Array;
  contentType: string;
  model: typeof MINIMAX_IMAGE_MODEL;
  requestId: string;
}

interface MiniMaxApiResponse {
  id?: unknown;
  data?: { image_urls?: unknown };
  base_resp?: { status_code?: unknown; status_msg?: unknown };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatedPrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) throw new Error("MiniMax image prompt is required");
  if (Array.from(normalized).length > MAX_PROMPT_CHARACTERS) {
    throw new Error(`MiniMax image prompt must be ${MAX_PROMPT_CHARACTERS} characters or fewer`);
  }
  return normalized;
}

function validatedAspectRatio(aspectRatio: string | undefined): string {
  const value = aspectRatio?.trim() || DEFAULT_ASPECT_RATIO;
  if (!ALLOWED_ASPECT_RATIOS.has(value)) {
    throw new Error("MiniMax image aspect ratio is not supported");
  }
  return value;
}

export function buildMiniMaxImageRequest(input: MiniMaxImageInput) {
  return {
    model: MINIMAX_IMAGE_MODEL,
    prompt: validatedPrompt(input.prompt),
    aspect_ratio: validatedAspectRatio(input.aspectRatio),
    response_format: "url",
    n: 1,
    prompt_optimizer: true,
  };
}

function validatedImageUrl(value: unknown): URL {
  if (typeof value !== "string") throw new Error("MiniMax response did not include an image URL");
  const url = new URL(value);
  // MiniMax serves results from its Alibaba OSS buckets, sometimes over plain http.
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !url.hostname.endsWith(".aliyuncs.com")
  ) {
    throw new Error("MiniMax response included an untrusted image URL");
  }
  return url;
}

export function parseMiniMaxImageResponse(payload: unknown): {
  imageUrl: URL;
  requestId: string;
} {
  if (!isRecord(payload)) throw new Error("MiniMax returned an invalid response");
  const response = payload as MiniMaxApiResponse;
  const statusCode = response.base_resp?.status_code;
  if (statusCode !== 0 && statusCode !== "0") {
    const message =
      typeof response.base_resp?.status_msg === "string"
        ? response.base_resp.status_msg
        : "unknown error";
    throw new Error(`MiniMax image generation failed (${String(statusCode)}): ${message}`);
  }

  const urls = response.data?.image_urls;
  const first = Array.isArray(urls) ? urls[0] : undefined;
  const requestId = typeof response.id === "string" && response.id ? response.id : "minimax-image";

  return { imageUrl: validatedImageUrl(first), requestId };
}

type MiniMaxEnvironment = Record<string, string | undefined>;

function minimaxApiKey(environment: MiniMaxEnvironment): string {
  const key = environment.MINIMAX_API_KEY?.trim();
  if (!key) throw new Error("Missing MINIMAX_API_KEY (see .env.example)");
  return key;
}

async function responseJson(response: Response, service: string): Promise<unknown> {
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${service} returned a non-JSON response`);
  }
  if (!response.ok) {
    const error = isRecord(body) ? body : {};
    const message = typeof error.message === "string" ? error.message : response.statusText;
    throw new Error(`${service} failed (${response.status}): ${message}`);
  }
  return body;
}

function withTimeout(milliseconds: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function generateMiniMaxImage(
  input: MiniMaxImageInput,
  {
    environment = process.env,
    fetchImpl = fetch,
    signal,
  }: { environment?: MiniMaxEnvironment; fetchImpl?: Fetch; signal?: AbortSignal } = {},
): Promise<MiniMaxImageResult> {
  const generation = await fetchImpl(MINIMAX_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${minimaxApiKey(environment)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildMiniMaxImageRequest(input)),
    signal: withTimeout(GENERATION_TIMEOUT_MS, signal),
  });
  const parsed = parseMiniMaxImageResponse(await responseJson(generation, "MiniMax"));

  const image = await fetchImpl(parsed.imageUrl, {
    signal: withTimeout(DOWNLOAD_TIMEOUT_MS, signal),
  });
  if (!image.ok) throw new Error(`MiniMax image download failed (${image.status})`);
  const contentType = image.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("MiniMax image download did not return an image");
  }

  const declaredLength = Number(image.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("MiniMax image download exceeded the maximum allowed size");
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("MiniMax image download returned an invalid size");
  }

  return {
    bytes,
    contentType: contentType.split(";")[0],
    model: MINIMAX_IMAGE_MODEL,
    requestId: parsed.requestId,
  };
}

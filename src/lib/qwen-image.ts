const QWEN_IMAGE_ENDPOINT =
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_IMAGE_MODEL = "z-image-turbo";
const DEFAULT_IMAGE_SIZE = "1024*1024";
const MAX_PROMPT_CHARACTERS = 800;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface QwenImageInput {
  prompt: string;
  size?: string;
  seed?: number;
  promptExtend?: boolean;
}

export interface QwenImageResult {
  bytes: Uint8Array;
  contentType: "image/png";
  model: typeof QWEN_IMAGE_MODEL;
  requestId: string;
  width: number;
  height: number;
}

interface QwenApiResponse {
  request_id?: unknown;
  code?: unknown;
  message?: unknown;
  output?: {
    choices?: Array<{
      finish_reason?: unknown;
      message?: {
        content?: Array<{ image?: unknown; text?: unknown }>;
      };
    }>;
  };
  usage?: {
    width?: unknown;
    height?: unknown;
    image_count?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatedPrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) throw new Error("Qwen image prompt is required");
  if (Array.from(normalized).length > MAX_PROMPT_CHARACTERS) {
    throw new Error(`Qwen image prompt must be ${MAX_PROMPT_CHARACTERS} characters or fewer`);
  }
  return normalized;
}

function validatedSize(size: string | undefined): string {
  const value = size?.trim() || DEFAULT_IMAGE_SIZE;
  const match = /^(\d+)\*(\d+)$/.exec(value);
  if (!match) throw new Error("Qwen image size must use the width*height format");

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 512 || width > 2048 || height < 512 || height > 2048) {
    throw new Error("Qwen image width and height must be between 512 and 2048 pixels");
  }
  return value;
}

function validatedSeed(seed: number | undefined): number | undefined {
  if (seed === undefined) return undefined;
  if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) {
    throw new Error("Qwen image seed must be an integer between 0 and 2147483647");
  }
  return seed;
}

export function buildQwenImageRequest(input: QwenImageInput) {
  const seed = validatedSeed(input.seed);
  return {
    model: QWEN_IMAGE_MODEL,
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: validatedPrompt(input.prompt) }],
        },
      ],
    },
    parameters: {
      prompt_extend: input.promptExtend ?? false,
      size: validatedSize(input.size),
      ...(seed === undefined ? {} : { seed }),
    },
  };
}

function validatedImageUrl(value: unknown): URL {
  if (typeof value !== "string") throw new Error("Qwen response did not include an image URL");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.startsWith("dashscope-result-") ||
    !url.hostname.endsWith(".aliyuncs.com")
  ) {
    throw new Error("Qwen response included an untrusted image URL");
  }
  return url;
}

export function parseQwenImageResponse(payload: unknown) {
  if (!isRecord(payload)) throw new Error("Qwen returned an invalid response");
  const response = payload as QwenApiResponse;
  const choice = response.output?.choices?.[0];
  const image = choice?.message?.content?.find((item) => item.image !== undefined)?.image;
  const width = response.usage?.width;
  const height = response.usage?.height;

  if (choice?.finish_reason !== "stop") {
    const code = typeof response.code === "string" ? response.code : "generation_failed";
    const message = typeof response.message === "string" ? response.message : "unknown error";
    throw new Error(`Qwen image generation failed (${code}): ${message}`);
  }
  if (
    typeof response.request_id !== "string" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new Error("Qwen response is missing required generation metadata");
  }

  return {
    imageUrl: validatedImageUrl(image),
    requestId: response.request_id,
    width: Number(width),
    height: Number(height),
  };
}

type QwenEnvironment = Record<string, string | undefined>;

function qwenApiKey(environment: QwenEnvironment): string {
  const key = environment.DASHSCOPE_API_KEY?.trim() || environment.QWEN_API_KEY?.trim();
  if (!key) {
    throw new Error("Missing DASHSCOPE_API_KEY or QWEN_API_KEY (see .env.example)");
  }
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
    const code = typeof error.code === "string" ? error.code : response.status;
    const message = typeof error.message === "string" ? error.message : response.statusText;
    throw new Error(`${service} failed (${code}): ${message}`);
  }
  return body;
}

export async function generateQwenImage(
  input: QwenImageInput,
  {
    environment = process.env,
    fetchImpl = fetch,
  }: { environment?: QwenEnvironment; fetchImpl?: Fetch } = {},
): Promise<QwenImageResult> {
  const generation = await fetchImpl(QWEN_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qwenApiKey(environment)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildQwenImageRequest(input)),
    signal: AbortSignal.timeout(90_000),
  });
  const parsed = parseQwenImageResponse(await responseJson(generation, "Qwen"));

  const image = await fetchImpl(parsed.imageUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!image.ok) throw new Error(`Qwen image download failed (${image.status})`);
  if (!image.headers.get("content-type")?.toLowerCase().startsWith("image/png")) {
    throw new Error("Qwen image download did not return a PNG");
  }

  const declaredLength = Number(image.headers.get("content-length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Qwen image download exceeded the maximum allowed size");
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Qwen image download returned an invalid size");
  }

  return {
    bytes,
    contentType: "image/png",
    model: QWEN_IMAGE_MODEL,
    requestId: parsed.requestId,
    width: parsed.width,
    height: parsed.height,
  };
}

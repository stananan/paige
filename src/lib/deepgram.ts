const DEEPGRAM_LISTEN_ENDPOINT = "https://api.deepgram.com/v1/listen";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Environment = Record<string, string | undefined>;

export interface DeepgramTranscript {
  transcript: string;
  confidence: number;
  words: number;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: unknown;
        confidence?: unknown;
        words?: unknown;
      }>;
    }>;
  };
  err_msg?: unknown;
}

function isSupportedAudioType(contentType: string): boolean {
  return /^(?:audio\/(?:webm|ogg|mp4|wav|x-wav|mpeg|aac)|video\/webm)(?:;|$)/i.test(
    contentType,
  );
}

export function parseDeepgramTranscript(payload: unknown): DeepgramTranscript {
  const response = payload as DeepgramResponse;
  const alternative = response?.results?.channels?.[0]?.alternatives?.[0];
  const transcript =
    typeof alternative?.transcript === "string"
      ? alternative.transcript.trim()
      : "";
  const confidence =
    typeof alternative?.confidence === "number" ? alternative.confidence : 0;
  const words = Array.isArray(alternative?.words)
    ? alternative.words.length
    : transcript
        .split(/\s+/)
        .filter(Boolean).length;

  return { transcript, confidence, words };
}

export async function transcribeDeepgramAudio(
  audio: Uint8Array,
  contentType: string,
  {
    environment = process.env,
    fetchImpl = fetch,
  }: { environment?: Environment; fetchImpl?: Fetch } = {},
): Promise<DeepgramTranscript> {
  const apiKey = environment.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing DEEPGRAM_API_KEY");
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Deepgram audio payload has an invalid size");
  }
  if (!isSupportedAudioType(contentType)) {
    throw new Error("Deepgram audio format is not supported");
  }

  const url = new URL(DEEPGRAM_LISTEN_ENDPOINT);
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("language", "en");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("numerals", "true");
  url.searchParams.set("mip_opt_out", "true");
  url.searchParams.set("keyterm", "Paige");
  const body = Uint8Array.from(audio).buffer;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType,
    },
    body,
    signal: AbortSignal.timeout(25_000),
  });
  const payload = (await response.json()) as DeepgramResponse;
  if (!response.ok) {
    const message =
      typeof payload.err_msg === "string"
        ? payload.err_msg
        : response.statusText || "unknown error";
    throw new Error(`Deepgram transcription failed (${response.status}): ${message}`);
  }
  return parseDeepgramTranscript(payload);
}

// Minimal typing + factory for the Web Speech API (Chrome's webkitSpeechRecognition),
// which isn't reliably in the TS DOM lib. We declare only what Paige uses.

export interface SRAlternative {
  readonly transcript: string;
}
export interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SRAlternative;
}
export interface SRResultList {
  readonly length: number;
  readonly [index: number]: SRResult;
}
export interface SRResultEvent {
  readonly resultIndex: number;
  readonly results: SRResultList;
}
export interface SRErrorEvent {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SRConstructor = new () => SpeechRecognitionLike;

/** A configured recognition instance, or null if the browser lacks support. */
export function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}

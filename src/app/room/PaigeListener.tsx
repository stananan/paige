"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { PaigeAnswer, PaigeChart } from "@/lib/paige-answer";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/speech";

// The Web Speech API often hears "Paige" as the homophone "page"/"pages".
// Accept those so the wake word actually fires.
const WAKE_VARIANTS = ["paige", "pages", "page", "padge", "paij"];

function extractCommand(transcript: string): string | null {
  const lower = transcript.toLowerCase();
  let at = -1;
  let len = 0;
  for (const w of WAKE_VARIANTS) {
    const i = lower.indexOf(w);
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
      len = w.length;
    }
  }
  if (at === -1) return null;
  return transcript.slice(at + len).replace(/^[\s,.:!?]+/, "").trim();
}

export interface GeneratedImage {
  dataUrl: string;
  model: string;
}

export interface PaigeState {
  supported: boolean;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  heard: string;
  reply: PaigeAnswer | null;
  error: string;
  image: GeneratedImage | null;
  imageLoading: boolean;
  /** Reply carries something worth putting on the shared screen (citation/chart). */
  presenting: boolean;
  input: string;
  setInput: (value: string) => void;
  toggle: () => void;
  submitChat: (event: FormEvent) => void;
  ask: (command: string) => void;
  dismiss: () => void;
}

function isGrounded(reply: PaigeAnswer | null): boolean {
  return Boolean(reply && (reply.citations.length > 0 || reply.chart));
}

// Paige's brain: Web Speech wake-word listening, TTS playback, the /api/ask call,
// and the slow-beat /api/image race. Lifted to a hook so the participant tile, the
// shared-screen stage, and the control dock all read one shared state.
export function usePaige(): PaigeState {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<PaigeAnswer | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const speakingRef = useRef(false);
  const wantListeningRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const imageRequestRef = useRef<AbortController | null>(null);

  const speak = useCallback(async (text: string) => {
    setSpeaking(true);
    speakingRef.current = true;
    try {
      recogRef.current?.stop();
    } catch {}
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        await new Promise<void>((resolve) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audio.onerror = () => resolve();
          audio.play().catch(() => resolve());
        });
      }
    } finally {
      setSpeaking(false);
      speakingRef.current = false;
      if (wantListeningRef.current) {
        try {
          recogRef.current?.start();
        } catch {}
      }
    }
  }, []);

  // The slow beat: a generated illustration via the Qwen/MiniMax race. Best-effort
  // — if it fails, Paige keeps the cited card/chart and shows nothing extra.
  const generateImage = useCallback(async (topic: string) => {
    imageRequestRef.current?.abort();
    const controller = new AbortController();
    imageRequestRef.current = controller;
    setImage(null);
    setImageLoading(true);
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { dataUrl?: string; model?: string };
      if (typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:image/")) {
        setImage({ dataUrl: data.dataUrl, model: data.model ?? "AI" });
      }
    } catch {
      // swallow — image is a flourish, never required
    } finally {
      if (imageRequestRef.current === controller) {
        imageRequestRef.current = null;
        setImageLoading(false);
      }
    }
  }, []);

  const ask = useCallback(
    async (command: string) => {
      const q = command.trim();
      if (!q) return;

      requestRef.current?.abort();
      imageRequestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setThinking(true);
      setReply(null);
      setImage(null);
      setImageLoading(false);
      setError("");
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q }),
          signal: controller.signal,
        });
        const body = (await response.json()) as PaigeAnswer & { error?: string };
        if (!response.ok) throw new Error(body.error || "Paige couldn't answer");

        setReply(body);
        setThinking(false);
        if (requestRef.current === controller) requestRef.current = null;
        // Kick off the image race only when she's actually presenting data.
        if (isGrounded(body)) void generateImage(body.answer || q);
        await speak(body.answer);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Paige couldn't answer");
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setThinking(false);
        }
      }
    },
    [speak, generateImage],
  );

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (speakingRef.current) return;
      setHeard(transcript);
      if (!isFinal) return;
      const command = extractCommand(transcript);
      if (command === null) return; // wake word not heard -> stay silent
      void ask(command);
    },
    [ask],
  );

  useEffect(() => {
    const recog = getSpeechRecognition();
    if (!recog) {
      const timeout = window.setTimeout(() => setSupported(false), 0);
      return () => window.clearTimeout(timeout);
    }
    recogRef.current = recog;

    recog.onstart = () => setListening(true);
    recog.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final) handleTranscript(final, true);
      else if (interim) handleTranscript(interim, false);
    };
    recog.onerror = () => {};
    recog.onend = () => {
      if (wantListeningRef.current && !speakingRef.current) {
        try {
          recog.start();
        } catch {}
      }
    };

    wantListeningRef.current = true;
    try {
      recog.start();
    } catch {}

    return () => {
      requestRef.current?.abort();
      imageRequestRef.current?.abort();
      wantListeningRef.current = false;
      try {
        recog.abort();
      } catch {}
    };
  }, [handleTranscript]);

  const toggle = useCallback(() => {
    const recog = recogRef.current;
    if (!recog) return;
    if (listening) {
      wantListeningRef.current = false;
      try {
        recog.stop();
      } catch {}
      setListening(false);
    } else {
      wantListeningRef.current = true;
      try {
        recog.start();
      } catch {}
      setListening(true);
    }
  }, [listening]);

  const submitChat = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (!q) return;
      setHeard(q);
      setInput("");
      void ask(q);
    },
    [input, ask],
  );

  const dismiss = useCallback(() => {
    imageRequestRef.current?.abort();
    setReply(null);
    setImage(null);
    setImageLoading(false);
    setError("");
  }, []);

  return {
    supported,
    listening,
    thinking,
    speaking,
    heard,
    reply,
    error,
    image,
    imageLoading,
    presenting: isGrounded(reply),
    input,
    setInput,
    toggle,
    submitChat,
    ask,
    dismiss,
  };
}

function statusLabel(paige: PaigeState): string {
  if (paige.speaking) return "Speaking";
  if (paige.thinking) return "Searching";
  if (paige.listening) return "Listening";
  return "Idle";
}

function statusColor(paige: PaigeState): string {
  if (paige.speaking) return "bg-emerald-400";
  if (paige.thinking) return "bg-amber-300";
  if (paige.listening) return "bg-sky-400";
  return "bg-white/30";
}

// Paige rendered as a peer in the participant grid — her own avatar, name, and a
// live status light, so she reads as the third participant rather than a sidebar.
export function PaigeTile({ paige, compact = false }: { paige: PaigeState; compact?: boolean }) {
  const active = paige.speaking || paige.thinking || paige.listening;
  const conversational = paige.reply && !paige.presenting ? paige.reply.answer : "";

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#10233b] via-[#0b1626] to-[#0a0f1c] text-white">
      <div className="relative">
        <span
          className={`absolute inset-0 rounded-full ${statusColor(paige)} ${
            active ? "animate-ping opacity-40" : "opacity-0"
          }`}
        />
        <div
          className={`relative flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-sky-400 font-semibold text-[#0a0f1c] ${
            compact ? "h-10 w-10 text-base" : "h-20 w-20 text-3xl"
          }`}
        >
          P
        </div>
      </div>

      {!compact && conversational && (
        <p className="mt-4 max-w-[85%] text-center text-sm leading-snug text-white/80">
          “{conversational}”
        </p>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
        <span className={`font-medium ${compact ? "text-[10px]" : "text-xs"}`}>
          Paige{compact ? "" : " · AI copilot"}
        </span>
      </div>
      {!compact && (
        <span className="absolute right-2 top-2 rounded-md bg-black/35 px-2 py-0.5 text-[10px] text-white/70 backdrop-blur">
          {statusLabel(paige)}
        </span>
      )}
    </div>
  );
}

// Paige's "screen share": when she has a cited answer she takes the main stage and
// presents the spoken takeaway, a deterministic chart, citations, and — a beat
// later — the generated illustration labeled with the model that won the race.
export function PaigeStage({ paige }: { paige: PaigeState }) {
  const { reply, image, imageLoading } = paige;
  if (!reply) return null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-emerald-400/20 bg-[#070d18] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-sm font-medium">Paige is sharing her screen</span>
        </div>
        <button
          onClick={paige.dismiss}
          className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10"
          aria-label="Stop sharing"
        >
          Stop sharing ✕
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-4">
          <p className="text-balance text-2xl font-semibold leading-snug text-emerald-100">
            {reply.answer}
          </p>
          {reply.chart && <AnswerChart chart={reply.chart} large />}
          {reply.citations.length > 0 && (
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-white/40">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {reply.citations.map((citation) => (
                  <span
                    key={`${citation.sourceFile}-${citation.page}`}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70"
                  >
                    {citation.sourceFile} · p.{citation.page}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <figure className="flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="relative flex flex-1 items-center justify-center">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.dataUrl}
                alt="Paige generated illustration"
                className="h-full w-full object-cover"
              />
            ) : imageLoading ? (
              <div className="flex flex-col items-center gap-3 text-white/50">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300" />
                <span className="text-xs">Generating a visual…</span>
              </div>
            ) : (
              <span className="text-xs text-white/30">No generated visual</span>
            )}
          </div>
          <figcaption className="border-t border-white/10 px-3 py-2 text-[11px] text-white/55">
            {image
              ? `Generated illustration · ${image.model}`
              : imageLoading
                ? "Qwen vs MiniMax racing…"
                : "Generated visual (illustrative, not a data source)"}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

// Always-visible control surface: mic toggle, what Paige heard, the type-to-Paige
// box, and any error. Kept compact and docked so it never hides the meeting.
export function PaigeDock({ paige }: { paige: PaigeState }) {
  const active = paige.speaking || paige.thinking || paige.listening;
  return (
    <div className="pointer-events-auto absolute bottom-20 right-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/75 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
          <span className="text-sm font-semibold tracking-tight">Paige</span>
        </div>
        {paige.supported && (
          <button
            onClick={paige.toggle}
            className="rounded-full border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10"
          >
            {statusLabel(paige)}
            {active ? "…" : ""}
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] text-white/45">
        {paige.supported ? "Say “Paige, …” or type below" : "Voice needs Chrome — type below"}
      </p>
      {paige.heard && (
        <p className="mt-1 text-xs text-white/70">
          <span className="text-white/40">heard:</span> {paige.heard}
        </p>
      )}
      {paige.thinking && <p className="mt-1 text-xs text-amber-200">Searching the company documents…</p>}
      {paige.error && <p className="mt-1 text-xs text-red-300">{paige.error}</p>}

      <form onSubmit={paige.submitChat} className="mt-2 flex gap-1.5">
        <input
          value={paige.input}
          onChange={(e) => paige.setInput(e.target.value)}
          placeholder="Type to Paige…"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-white/40"
        />
        <button
          type="submit"
          disabled={paige.thinking || paige.speaking}
          className="rounded-lg border border-white/20 px-2.5 text-sm hover:bg-white/10 disabled:opacity-40"
          aria-label="Send to Paige"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

export function AnswerChart({ chart, large = false }: { chart: PaigeChart; large?: boolean }) {
  const width = 380;
  const height = large ? 220 : 180;
  const left = 38;
  const top = 18;
  const bottom = 42;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(...chart.values, 0);
  const minValue = Math.min(...chart.values, 0);
  const range = maxValue - minValue || 1;
  const slotWidth = (width - left - 12) / chart.values.length;
  const zeroY = top + (maxValue / range) * plotHeight;

  return (
    <figure className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <figcaption className="mb-2">
        <p className="text-xs font-medium text-white/80">{chart.title}</p>
        <p className="text-[10px] text-white/40">{chart.unit}</p>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${chart.title}, ${chart.unit}`}
        className="w-full"
      >
        <line x1={left} y1={zeroY} x2={width - 8} y2={zeroY} stroke="rgba(255,255,255,.22)" />
        {chart.values.map((value, index) => {
          const barHeight = (Math.abs(value) / range) * plotHeight;
          const x = left + index * slotWidth + slotWidth * 0.18;
          const y = value >= 0 ? zeroY - barHeight : zeroY;
          return (
            <g key={`${chart.labels[index]}-${index}`}>
              <rect
                x={x}
                y={y}
                width={slotWidth * 0.64}
                height={Math.max(2, barHeight)}
                rx="4"
                fill="rgb(52 211 153)"
                opacity="0.85"
              />
              <text
                x={x + slotWidth * 0.32}
                y={value >= 0 ? Math.max(12, y - 5) : y + barHeight + 13}
                textAnchor="middle"
                fill="rgba(255,255,255,.8)"
                fontSize="10"
              >
                {value.toLocaleString()}
              </text>
              <text
                x={x + slotWidth * 0.32}
                y={height - 16}
                textAnchor="middle"
                fill="rgba(255,255,255,.55)"
                fontSize="10"
              >
                {chart.labels[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

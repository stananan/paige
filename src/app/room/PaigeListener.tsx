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

export interface PaigeState {
  supported: boolean;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  heard: string;
  reply: PaigeAnswer | null;
  error: string;
  /** Reply carries something worth presenting inside Paige's tile. */
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

// Paige's brain: Web Speech wake-word listening, TTS playback, and the /api/ask
// call. Lifted to a hook so the participant tile and control dock share one state.
export function usePaige(): PaigeState {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<PaigeAnswer | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const speakingRef = useRef(false);
  const wantListeningRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopSpeech = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audioRef.current = null;
    audio.pause();
    audio.dispatchEvent(new Event("error"));
    setSpeaking(false);
    speakingRef.current = false;
  }, []);

  const speak = useCallback(async (
    text: string,
    signal: AbortSignal,
    revealAnswer: () => void,
  ) => {
    let revealed = false;
    const reveal = () => {
      if (revealed || signal.aborted) return;
      revealed = true;
      revealAnswer();
    };

    let res: Response;
    try {
      res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal,
      });
    } catch (reason) {
      if (signal.aborted) throw reason;
      reveal();
      return;
    }
    if (!res.ok) {
      reveal();
      return;
    }

    const url = URL.createObjectURL(await res.blob());
    if (signal.aborted) {
      URL.revokeObjectURL(url);
      return;
    }
    const audio = new Audio(url);
    audio.preload = "auto";
    audioRef.current = audio;
    setSpeaking(true);
    speakingRef.current = true;
    try {
      recogRef.current?.stop();
    } catch {}

    try {
      const ended = new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
      });
      await audio.play();
      reveal();
      await ended;
    } catch {
      reveal();
    } finally {
      if (audioRef.current === audio) audioRef.current = null;
      URL.revokeObjectURL(url);
      setSpeaking(false);
      speakingRef.current = false;
      if (wantListeningRef.current) {
        try {
          recogRef.current?.start();
        } catch {}
      }
    }
  }, []);

  const ask = useCallback(
    async (command: string) => {
      const q = command.trim();
      if (!q) return;

      requestRef.current?.abort();
      stopSpeech();
      const controller = new AbortController();
      requestRef.current = controller;
      setThinking(true);
      setReply(null);
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

        const revealAnswer = () => {
          setReply(body);
          setThinking(false);
        };
        await speak(body.answer, controller.signal, revealAnswer);
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
    [speak, stopSpeech],
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
      stopSpeech();
      wantListeningRef.current = false;
      try {
        recog.abort();
      } catch {}
    };
  }, [handleTranscript, stopSpeech]);

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
    setReply(null);
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

function sourceLabel(sourceFile: string): string {
  return sourceFile.split("/").at(-1) ?? sourceFile;
}

// Paige stays the same size as every webcam tile. Grounded answers render inside
// her tile, so presenting data never takes over the room or enlarges her window.
export function PaigeTile({ paige, compact = false }: { paige: PaigeState; compact?: boolean }) {
  const active = paige.speaking || paige.thinking || paige.listening;
  const conversational = paige.reply && !paige.presenting ? paige.reply.answer : "";

  if (!compact && paige.reply && paige.presenting) {
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-[#070d18] text-white">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
            <span className="text-xs font-medium">Paige · cited answer</span>
          </div>
          <button
            type="button"
            onClick={paige.dismiss}
            className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
            aria-label="Close Paige answer"
          >
            Close ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <p className="text-sm font-semibold leading-snug text-emerald-100">
            {paige.reply.answer}
          </p>
          {paige.reply.chart && <AnswerChart chart={paige.reply.chart} />}
          {paige.reply.citations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {paige.reply.citations.map((citation) =>
                citation.url ? (
                  <a
                    key={`${citation.sourceFile}-${citation.page}`}
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-1 text-[9px] text-emerald-100 hover:bg-emerald-300/20"
                    title={citation.sourceFile}
                  >
                    {sourceLabel(citation.sourceFile)} · p.{citation.page} · Open PDF ↗
                  </a>
                ) : (
                  <span
                    key={`${citation.sourceFile}-${citation.page}`}
                    className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[9px] text-white/60"
                  >
                    {sourceLabel(citation.sourceFile)} · p.{citation.page}
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

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

// Dismissible control surface: mic toggle, what Paige heard, the type-to-Paige
// box, and any error. Closing it does not disable wake-word listening.
export function PaigeDock({ paige, onClose }: { paige: PaigeState; onClose: () => void }) {
  const active = paige.speaking || paige.thinking || paige.listening;
  return (
    <div className="pointer-events-auto absolute bottom-20 right-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/75 p-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
          <span className="text-sm font-semibold tracking-tight">Paige</span>
        </div>
        <div className="flex items-center gap-1.5">
          {paige.supported && (
            <button
              type="button"
              onClick={paige.toggle}
              className="rounded-full border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10"
            >
              {statusLabel(paige)}
              {active ? "…" : ""}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10"
            aria-label="Close Paige text window"
          >
            ✕
          </button>
        </div>
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
        <p className="text-[10px] text-white/40">
          {chart.unit} · Generated from cited PDF data
        </p>
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

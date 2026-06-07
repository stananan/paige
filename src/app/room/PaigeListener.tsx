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

export default function PaigeListener() {
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

  // Synthesize + play Paige's reply via MiniMax (/api/tts). Pause recognition
  // while she speaks so she doesn't transcribe her own voice.
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

  // Shared by voice (wake word) and the chat box.
  const respond = useCallback(
    async (command: string) => {
      const q = command.trim();
      if (!q) return;

      requestRef.current?.abort();
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

        setReply(body);
        setThinking(false);
        if (requestRef.current === controller) requestRef.current = null;
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
    [speak],
  );

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (speakingRef.current) return;
      setHeard(transcript);
      if (!isFinal) return;
      const command = extractCommand(transcript);
      if (command === null) return; // wake word not heard -> stay silent
      void respond(command);
    },
    [respond],
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

  function submitChat(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setHeard(q);
    setInput("");
    void respond(q);
  }

  const dot = speaking
    ? "bg-emerald-400"
    : thinking
      ? "bg-amber-300"
      : listening
        ? "bg-sky-400"
        : "bg-white/30";

  return (
    <div className="absolute right-4 top-4 z-10 max-h-[calc(100dvh-7rem)] w-[min(27rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/10 bg-black/75 p-4 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${dot} ${speaking || thinking || listening ? "animate-pulse" : ""}`}
          />
          <span className="font-semibold tracking-tight">Paige</span>
        </div>
        {supported && (
          <button
            onClick={toggle}
            className="rounded-full border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10"
          >
            {speaking ? "Speaking…" : thinking ? "Searching…" : listening ? "Listening…" : "Start"}
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm">
        <p className="text-xs text-white/50">
          {supported ? "Say “Paige, …” or type below" : "Voice needs Chrome — type below"}
        </p>
        {heard && (
          <p className="text-white/70">
            <span className="text-white/40">heard:</span> {heard}
          </p>
        )}
        {thinking && <p className="text-amber-200">Searching the company documents…</p>}
        {error && <p className="text-red-300">{error}</p>}
        {reply && (
          <div className="space-y-3">
            <p className="text-base leading-snug text-emerald-200">{reply.answer}</p>
            {reply.chart && <AnswerChart chart={reply.chart} />}
            {reply.citations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {reply.citations.map((citation) => (
                  <span
                    key={`${citation.sourceFile}-${citation.page}`}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60"
                  >
                    {citation.sourceFile} · p.{citation.page}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submitChat} className="mt-3 flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type to Paige…"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-sm outline-none placeholder:text-white/30 focus:border-white/40"
        />
        <button
          type="submit"
          disabled={thinking || speaking}
          className="rounded-lg border border-white/20 px-2.5 text-sm hover:bg-white/10 disabled:opacity-40"
          aria-label="Send to Paige"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

function AnswerChart({ chart }: { chart: PaigeChart }) {
  const width = 380;
  const height = 180;
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
        <line
          x1={left}
          y1={zeroY}
          x2={width - 8}
          y2={zeroY}
          stroke="rgba(255,255,255,.22)"
        />
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

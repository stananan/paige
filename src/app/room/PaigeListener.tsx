"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  const [reply, setReply] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState("");

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const speakingRef = useRef(false);
  const wantListeningRef = useRef(false);

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
      // Task #2 spine: echo. The fast beat (task #4) replaces this with
      // Moss retrieve -> LLM (TrueFoundry) -> cited answer.
      const text = q ? `You asked: ${q}` : "I'm here. What would you like to know?";
      setReply(text);
      await speak(text);
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

  const dot = speaking ? "bg-emerald-400" : listening ? "bg-sky-400" : "bg-white/30";

  return (
    <div className="absolute right-4 top-4 z-10 w-72 rounded-2xl border border-white/10 bg-black/70 p-4 text-white backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${dot} ${speaking || listening ? "animate-pulse" : ""}`}
          />
          <span className="font-semibold tracking-tight">Paige</span>
        </div>
        {supported && (
          <button
            onClick={toggle}
            className="rounded-full border border-white/20 px-2 py-0.5 text-xs hover:bg-white/10"
          >
            {speaking ? "Speaking…" : listening ? "Listening…" : "Start"}
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
        {reply && <p className="text-emerald-300">{reply}</p>}
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
          className="rounded-lg border border-white/20 px-2.5 text-sm hover:bg-white/10"
          aria-label="Send to Paige"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

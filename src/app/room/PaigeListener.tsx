"use client";

import {
  useDataChannel,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  type Participant,
} from "livekit-client";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  PaigeAnswer,
  PaigeChart,
  PaigeConversationTurn,
} from "@/lib/paige-answer";
import {
  appendConversationTurn,
  decodePaigeRoomEvent,
  encodePaigeRoomEvent,
  interactionIdFromImageName,
  PAIGE_DATA_TOPIC,
  PAIGE_IMAGE_TOPIC,
  sharedImageFileName,
  transcriptIntent,
  type PaigeRoomEvent,
} from "@/lib/paige-room";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/speech";

export interface PaigeState {
  supported: boolean;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  sessionActive: boolean;
  heard: string;
  reply: PaigeAnswer | null;
  error: string;
  /** Reply carries something worth presenting inside Paige's tile. */
  presenting: boolean;
  visualUrl: string;
  visualModel: string;
  visualLoading: boolean;
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

function requestsGeneratedBackdrop(question: string, answer: PaigeAnswer): boolean {
  return Boolean(
    answer.chart &&
      /\b(?:visual|visuali[sz]e|chart|graph|compare|comparison|trend)\b/i.test(
        question,
      ),
  );
}

function imageModelFromName(name: string): string {
  const encoded = name.split("--")[1]?.replace(/\.(?:png|jpe?g)$/i, "") ?? "";
  return encoded.replaceAll("-", " ") || "AI";
}

interface PaigeDataMessage {
  payload: Uint8Array;
  from?: { identity: string };
}

const ignoreRoomMessage = () => {};

export function usePaige(): PaigeState {
  const room = useRoomContext();
  const roomMessageHandlerRef = useRef<(message: PaigeDataMessage) => void>(
    ignoreRoomMessage,
  );
  const onRoomMessage = useCallback((message: PaigeDataMessage) => {
    roomMessageHandlerRef.current(message);
  }, []);
  const { send } = useDataChannel(PAIGE_DATA_TOPIC, onRoomMessage);
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<PaigeAnswer | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [visualUrl, setVisualUrl] = useState("");
  const [visualModel, setVisualModel] = useState("");
  const [visualLoading, setVisualLoading] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const speakingRef = useRef(false);
  const wantListeningRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishSpeechRef = useRef<(() => void) | null>(null);
  const speechInterruptedRef = useRef(false);
  const recognitionCooldownUntilRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const sessionUpdatedAtRef = useRef(0);
  const currentInteractionIdRef = useRef("");
  const currentQuestionRef = useRef("");
  const interactionUpdatedAtRef = useRef(0);
  const replyRef = useRef<PaigeAnswer | null>(null);
  const historyRef = useRef<PaigeConversationTurn[]>([]);
  const processedEventsRef = useRef(new Set<string>());
  const visualUrlRef = useRef("");
  const imageBlobRef = useRef<{
    blob: Blob;
    name: string;
    model: string;
    interactionId: string;
  } | null>(null);

  const clearVisual = useCallback(() => {
    if (visualUrlRef.current) URL.revokeObjectURL(visualUrlRef.current);
    visualUrlRef.current = "";
    imageBlobRef.current = null;
    setVisualUrl("");
    setVisualModel("");
    setVisualLoading(false);
  }, []);

  const installVisual = useCallback(
    (blob: Blob, name: string, interactionId: string, model?: string) => {
      if (interactionId !== currentInteractionIdRef.current) return;
      if (visualUrlRef.current) URL.revokeObjectURL(visualUrlRef.current);
      const url = URL.createObjectURL(blob);
      const resolvedModel = model || imageModelFromName(name);
      visualUrlRef.current = url;
      imageBlobRef.current = {
        blob,
        name,
        model: resolvedModel,
        interactionId,
      };
      setVisualUrl(url);
      setVisualModel(resolvedModel);
      setVisualLoading(false);
    },
    [],
  );

  const stopSpeech = useCallback((interrupted = true) => {
    speechInterruptedRef.current = interrupted;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
    finishSpeechRef.current?.();
    setSpeaking(false);
    speakingRef.current = false;
  }, []);

  const speak = useCallback(
    async (text: string, interactionId: string, revealAnswer: () => void) => {
      stopSpeech();
      const controller = new AbortController();
      speechAbortRef.current = controller;
      speechInterruptedRef.current = false;
      let revealed = false;
      const reveal = () => {
        if (
          revealed ||
          controller.signal.aborted ||
          currentInteractionIdRef.current !== interactionId
        ) {
          return;
        }
        revealed = true;
        revealAnswer();
      };

      let url = "";
      let audio: HTMLAudioElement | null = null;
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!response.ok) {
          reveal();
          return;
        }
        url = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) return;

        audio = new Audio(url);
        audio.preload = "auto";
        audioRef.current = audio;
        setSpeaking(true);
        speakingRef.current = true;

        const ended = new Promise<void>((resolve) => {
          finishSpeechRef.current = resolve;
          audio!.onended = () => resolve();
          audio!.onerror = () => resolve();
        });
        await audio.play();
        reveal();
        await ended;
      } catch (reason) {
        if (!controller.signal.aborted) {
          reveal();
          setError(
            reason instanceof Error && reason.name === "NotAllowedError"
              ? "Your browser blocked Paige audio. Click anywhere in the room, then ask again."
              : "",
          );
        }
      } finally {
        if (speechAbortRef.current === controller) speechAbortRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
        if (finishSpeechRef.current) finishSpeechRef.current = null;
        if (url) URL.revokeObjectURL(url);
        setSpeaking(false);
        speakingRef.current = false;
        if (!speechInterruptedRef.current) {
          recognitionCooldownUntilRef.current = Date.now() + 650;
        }
      }
    },
    [stopSpeech],
  );

  const publishEvent = useCallback(
    async (
      event: PaigeRoomEvent,
      destinationIdentities?: string[],
    ): Promise<void> => {
      processedEventsRef.current.add(event.eventId);
      if (room.state !== ConnectionState.Connected) return;
      try {
        await send(encodePaigeRoomEvent(event), {
          reliable: true,
          ...(destinationIdentities ? { destinationIdentities } : {}),
        });
      } catch (reason) {
        console.error("[paige] failed to publish shared room event", reason);
      }
    },
    [room, send],
  );

  const eventBase = useCallback(
    () => ({
      version: 1 as const,
      eventId: crypto.randomUUID(),
      at: Date.now(),
      by: room.localParticipant.identity,
    }),
    [room],
  );

  const applySession = useCallback(
    (active: boolean, at: number) => {
      if (at < sessionUpdatedAtRef.current) return;
      sessionUpdatedAtRef.current = at;
      sessionActiveRef.current = active;
      setSessionActive(active);
      if (!active) {
        requestRef.current?.abort();
        requestRef.current = null;
        stopSpeech();
        setThinking(false);
      }
    },
    [stopSpeech],
  );

  const setSharedSession = useCallback(
    (active: boolean) => {
      const event: PaigeRoomEvent = {
        ...eventBase(),
        type: "session",
        active,
      };
      applySession(active, event.at);
      void publishEvent(event);
    },
    [applySession, eventBase, publishEvent],
  );

  const applyThinking = useCallback(
    (
      interactionId: string,
      question: string,
      at: number,
      abortCurrentRequest = true,
    ) => {
      if (at < interactionUpdatedAtRef.current) return;
      if (abortCurrentRequest) {
        requestRef.current?.abort();
        requestRef.current = null;
      }
      stopSpeech();
      clearVisual();
      interactionUpdatedAtRef.current = at;
      currentInteractionIdRef.current = interactionId;
      currentQuestionRef.current = question;
      replyRef.current = null;
      setHeard(question);
      setReply(null);
      setError("");
      setThinking(true);
    },
    [clearVisual, stopSpeech],
  );

  const applyAnswer = useCallback(
    (
      interactionId: string,
      question: string,
      answer: PaigeAnswer,
      at: number,
      playAudio = true,
    ) => {
      if (at < interactionUpdatedAtRef.current) return;
      interactionUpdatedAtRef.current = at;
      currentInteractionIdRef.current = interactionId;
      currentQuestionRef.current = question;
      historyRef.current = appendConversationTurn(historyRef.current, {
        question,
        answer: answer.answer,
      });
      setVisualLoading(requestsGeneratedBackdrop(question, answer));

      const reveal = () => {
        replyRef.current = answer;
        setReply(answer);
        setThinking(false);
      };
      if (playAudio) void speak(answer.answer, interactionId, reveal);
      else reveal();
    },
    [speak],
  );

  const generateSharedVisual = useCallback(
    async (interactionId: string, question: string) => {
      try {
        const response = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: question }),
        });
        const body = (await response.json()) as {
          dataUrl?: string;
          contentType?: string;
          model?: string;
          error?: string;
        };
        if (!response.ok || !body.dataUrl || !body.contentType || !body.model) {
          throw new Error(body.error || "Image generation failed");
        }
        const blob = await (await fetch(body.dataUrl)).blob();
        const name = sharedImageFileName(
          interactionId,
          body.model,
          body.contentType,
        );
        installVisual(blob, name, interactionId, body.model);
        const file = new File([blob], name, { type: body.contentType });
        await room.localParticipant.sendFile(file, {
          topic: PAIGE_IMAGE_TOPIC,
          mimeType: body.contentType,
        });
        await publishEvent({
          ...eventBase(),
          type: "image",
          interactionId,
          status: "ready",
          model: body.model,
          imageName: name,
        });
      } catch (reason) {
        console.error("[paige] shared image generation failed", reason);
        if (currentInteractionIdRef.current === interactionId) {
          setVisualLoading(false);
        }
        await publishEvent({
          ...eventBase(),
          type: "image",
          interactionId,
          status: "failed",
        });
      }
    },
    [eventBase, installVisual, publishEvent, room],
  );

  const ask = useCallback(
    async (command: string) => {
      const q = command.trim();
      if (!q) return;

      if (!sessionActiveRef.current) setSharedSession(true);
      requestRef.current?.abort();
      const interactionId = crypto.randomUUID();
      const thinkingEvent: PaigeRoomEvent = {
        ...eventBase(),
        type: "thinking",
        interactionId,
        question: q,
        sessionActive: true,
      };
      applyThinking(interactionId, q, thinkingEvent.at, false);
      void publishEvent(thinkingEvent);

      const controller = new AbortController();
      requestRef.current = controller;
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            history: historyRef.current,
          }),
          signal: controller.signal,
        });
        const body = (await response.json()) as PaigeAnswer & { error?: string };
        if (!response.ok) throw new Error(body.error || "Paige couldn't answer");

        const answerEvent: PaigeRoomEvent = {
          ...eventBase(),
          type: "answer",
          interactionId,
          question: q,
          answer: body,
          sessionActive: sessionActiveRef.current,
        };
        applyAnswer(interactionId, q, body, answerEvent.at);
        void publishEvent(answerEvent);
        if (requestsGeneratedBackdrop(q, body)) {
          void generateSharedVisual(interactionId, q);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Paige couldn't answer");
        setThinking(false);
        const interruptEvent: PaigeRoomEvent = {
          ...eventBase(),
          type: "interrupt",
          interactionId,
        };
        void publishEvent(interruptEvent);
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
        }
      }
    },
    [
      applyAnswer,
      applyThinking,
      eventBase,
      generateSharedVisual,
      publishEvent,
      setSharedSession,
    ],
  );

  const handleTranscript = useCallback(
    (transcript: string, isFinal: boolean) => {
      if (
        Date.now() < recognitionCooldownUntilRef.current &&
        !room.localParticipant.isSpeaking
      ) {
        return;
      }
      if (speakingRef.current && !room.localParticipant.isSpeaking) return;
      setHeard(transcript);
      if (!isFinal) return;
      const intent = transcriptIntent(transcript, sessionActiveRef.current);
      if (intent.type === "end") {
        setSharedSession(false);
        return;
      }
      if (intent.type === "activate") {
        setSharedSession(true);
        return;
      }
      if (intent.type === "ask") {
        if (intent.activate) setSharedSession(true);
        stopSpeech();
        void ask(intent.command);
      }
    },
    [ask, room, setSharedSession, stopSpeech],
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
      if (wantListeningRef.current) {
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

  useEffect(() => {
    const handleActiveSpeakers = (speakers: Participant[]) => {
      if (!speakingRef.current || speakers.length === 0) return;
      stopSpeech();
      if (
        speakers.some(
          (participant) =>
            participant.identity === room.localParticipant.identity,
        )
      ) {
        void publishEvent({
          ...eventBase(),
          type: "interrupt",
          interactionId: currentInteractionIdRef.current || undefined,
        });
      }
    };
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [eventBase, publishEvent, room, stopSpeech]);

  useEffect(() => {
    room.registerByteStreamHandler(
      PAIGE_IMAGE_TOPIC,
      async (reader) => {
        const interactionId = interactionIdFromImageName(reader.info.name);
        if (!interactionId) return;
        try {
          const chunks = await reader.readAll({
            signal: AbortSignal.timeout(90_000),
          });
          const buffers = chunks.map((chunk) => {
            const copy = new Uint8Array(chunk.byteLength);
            copy.set(chunk);
            return copy.buffer;
          });
          installVisual(
            new Blob(buffers, { type: reader.info.mimeType }),
            reader.info.name,
            interactionId,
          );
        } catch (reason) {
          console.error("[paige] failed to receive shared image", reason);
          if (currentInteractionIdRef.current === interactionId) {
            setVisualLoading(false);
          }
        }
      },
    );
    return () => room.unregisterByteStreamHandler(PAIGE_IMAGE_TOPIC);
  }, [installVisual, room]);

  const handleRoomMessage = useCallback((message: PaigeDataMessage) => {
    const event = decodePaigeRoomEvent(message.payload);
    if (!event || processedEventsRef.current.has(event.eventId)) return;
    processedEventsRef.current.add(event.eventId);
    if (processedEventsRef.current.size > 200) {
      const oldest = processedEventsRef.current.values().next().value;
      if (oldest) processedEventsRef.current.delete(oldest);
    }

    if (event.type === "session") {
      applySession(event.active, event.at);
      return;
    }
    if (event.type === "thinking") {
      applySession(event.sessionActive, event.at);
      applyThinking(
        event.interactionId,
        event.question,
        event.at,
      );
      return;
    }
    if (event.type === "answer") {
      applySession(event.sessionActive, event.at);
      applyAnswer(
        event.interactionId,
        event.question,
        event.answer,
        event.at,
      );
      return;
    }
    if (event.type === "interrupt") {
      stopSpeech();
      setThinking(false);
      return;
    }
    if (event.type === "image") {
      if (
        event.interactionId === currentInteractionIdRef.current &&
        event.status === "failed"
      ) {
        setVisualLoading(false);
      }
      if (
        event.interactionId === currentInteractionIdRef.current &&
        event.status === "ready" &&
        event.model
      ) {
        setVisualModel(event.model);
      }
      return;
    }
    if (event.type === "snapshot") {
      if (event.updatedAt < interactionUpdatedAtRef.current) return;
      applySession(event.sessionActive, event.at);
      interactionUpdatedAtRef.current = event.updatedAt;
      currentInteractionIdRef.current = event.currentInteractionId;
      currentQuestionRef.current = event.question;
      historyRef.current = event.history;
      replyRef.current = event.answer;
      setHeard(event.question);
      setReply(event.answer);
      setThinking(false);
      setVisualLoading(Boolean(event.imageName && !imageBlobRef.current));
      return;
    }
    if (event.type === "state-request") {
      const requester = message.from?.identity || event.by;
      const responders = [
        room.localParticipant.identity,
        ...room.remoteParticipants.keys(),
      ]
        .filter((identity) => identity !== requester)
        .sort();
      if (responders[0] !== room.localParticipant.identity) return;

      const currentImage = imageBlobRef.current;
      const snapshot: PaigeRoomEvent = {
        ...eventBase(),
        type: "snapshot",
        sessionActive: sessionActiveRef.current,
        currentInteractionId: currentInteractionIdRef.current,
        question: currentQuestionRef.current,
        answer: replyRef.current,
        history: historyRef.current,
        updatedAt: interactionUpdatedAtRef.current,
        ...(currentImage ? { imageName: currentImage.name } : {}),
      };
      void publishEvent(snapshot, [requester]);
      if (currentImage) {
        const file = new File([currentImage.blob], currentImage.name, {
          type: currentImage.blob.type,
        });
        void room.localParticipant.sendFile(file, {
          topic: PAIGE_IMAGE_TOPIC,
          mimeType: currentImage.blob.type,
          destinationIdentities: [requester],
        });
      }
    }
  }, [
    applyAnswer,
    applySession,
    applyThinking,
    eventBase,
    publishEvent,
    room,
    stopSpeech,
  ]);

  useEffect(() => {
    roomMessageHandlerRef.current = handleRoomMessage;
    return () => {
      roomMessageHandlerRef.current = ignoreRoomMessage;
    };
  }, [handleRoomMessage]);

  useEffect(() => {
    let timeout: number | undefined;
    const requestState = () => {
      timeout = window.setTimeout(() => {
        void publishEvent({
          ...eventBase(),
          type: "state-request",
        });
      }, 600);
    };
    if (room.state === ConnectionState.Connected) {
      requestState();
    } else {
      room.once(RoomEvent.Connected, requestState);
    }
    return () => {
      room.off(RoomEvent.Connected, requestState);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [eventBase, publishEvent, room]);

  useEffect(
    () => () => {
      if (visualUrlRef.current) URL.revokeObjectURL(visualUrlRef.current);
    },
    [],
  );

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
      const intent = transcriptIntent(q, true);
      if (intent.type === "end") {
        setSharedSession(false);
        return;
      }
      if (intent.type === "activate") {
        setSharedSession(true);
        return;
      }
      if (intent.type !== "ask") return;
      if (!sessionActiveRef.current) setSharedSession(true);
      void ask(intent.command);
    },
    [input, ask, setSharedSession],
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
    sessionActive,
    heard,
    reply,
    error,
    presenting: isGrounded(reply),
    visualUrl,
    visualModel,
    visualLoading,
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

function pdfPreviewUrl(url: string, page = "1"): string {
  const cleanUrl = url.split("#")[0];
  const safePage = /^\d+$/.test(page) ? page : "1";
  return `${cleanUrl}#page=${safePage}&toolbar=0&navpanes=0&scrollbar=0`;
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
            <span className="text-xs font-medium">
              Paige · presenting to everyone
            </span>
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
          {paige.reply.chart && (
            <AnswerChart
              chart={paige.reply.chart}
              visualUrl={paige.visualUrl}
              visualModel={paige.visualModel}
              visualLoading={paige.visualLoading}
            />
          )}
          {paige.reply.citations[0]?.url && (
            <figure className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
              <figcaption className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-white/75">
                    Source preview ·{" "}
                    {sourceLabel(paige.reply.citations[0].sourceFile)}
                  </p>
                  <p className="text-[9px] text-white/40">
                    Cited page {paige.reply.citations[0].page}
                  </p>
                </div>
                <a
                  href={paige.reply.citations[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded border border-white/15 px-2 py-1 text-[9px] text-white/70 hover:bg-white/10"
                >
                  Open PDF
                </a>
              </figcaption>
              <iframe
                src={pdfPreviewUrl(
                  paige.reply.citations[0].url,
                  paige.reply.citations[0].page,
                )}
                title={`Preview of ${sourceLabel(paige.reply.citations[0].sourceFile)}`}
                className="h-52 w-full bg-white"
                loading="lazy"
              />
            </figure>
          )}
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
        {paige.supported
          ? paige.sessionActive
            ? "Paige session active · keep talking naturally · say “thanks Paige” to end"
            : "Say “Paige” once to start a conversation, or type below"
          : "Voice needs Chrome · type below"}
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

export function AnswerChart({
  chart,
  large = false,
  visualUrl = "",
  visualModel = "",
  visualLoading = false,
}: {
  chart: PaigeChart;
  large?: boolean;
  visualUrl?: string;
  visualModel?: string;
  visualLoading?: boolean;
}) {
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
    <figure className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-3">
      {visualUrl && (
        // Generated imagery is atmosphere only. The SVG and cited PDFs remain
        // the factual layer so a provider cannot invent labels or numbers.
        <div
          role="presentation"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
          style={{
            backgroundImage: `url("${visualUrl}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
      )}
      <div className="relative">
        <figcaption className="mb-2">
          <p className="text-xs font-medium text-white/80">{chart.title}</p>
          <p className="text-[10px] text-white/40">
            {chart.unit} · Exact values from cited PDFs
          </p>
          {visualLoading && (
            <p className="mt-1 text-[9px] text-sky-200/70">
              Generating a shared visual backdrop…
            </p>
          )}
          {visualUrl && (
            <p className="mt-1 text-[9px] text-sky-200/60">
              {visualModel || "AI"} backdrop is decorative, not evidence
            </p>
          )}
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
      </div>
    </figure>
  );
}

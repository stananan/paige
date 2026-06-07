"use client";

import {
  useDataChannel,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
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
  DeepgramParticipantTranscriber,
  supportsParticipantTranscription,
  type ParticipantTranscript,
} from "@/lib/deepgram-browser";
import {
  appendConversationTurn,
  decodePaigeRoomEvent,
  encodePaigeRoomEvent,
  isSubstantiveTranscript,
  interactionIdFromImageName,
  PAIGE_DATA_TOPIC,
  PAIGE_IMAGE_TOPIC,
  PREPARED_Q2_VISUAL_MODEL,
  PREPARED_Q2_VISUAL_PATH,
  preparedVisualForAnswer,
  sharedImageFileName,
  shouldGenerateVisual,
  visualRequestForAnswer,
  type VisualRequestKind,
  type PaigeRoomEvent,
} from "@/lib/paige-room";
import { PaigeAvatar } from "./PaigeAvatar";

export interface PaigeState {
  supported: boolean;
  listening: boolean;
  recording: boolean;
  thinking: boolean;
  speaking: boolean;
  mouthLevel: number;
  heard: string;
  heardBy: string;
  reply: PaigeAnswer | null;
  error: string;
  /** Reply carries something worth presenting inside Paige's tile. */
  presenting: boolean;
  visualUrl: string;
  visualModel: string;
  visualLoading: boolean;
  visualFailed: boolean;
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

function isTextEntryKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  );
  if (!(element instanceof HTMLInputElement)) return element !== null;
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(element.type);
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

export function usePaige(liveKitToken: string): PaigeState {
  const room = useRoomContext();
  const localIdentity = room.localParticipant.identity;
  const roomMessageHandlerRef = useRef<(message: PaigeDataMessage) => void>(
    ignoreRoomMessage,
  );
  const onRoomMessage = useCallback((message: PaigeDataMessage) => {
    roomMessageHandlerRef.current(message);
  }, []);
  const { send } = useDataChannel(PAIGE_DATA_TOPIC, onRoomMessage);
  const [supported] = useState(() => supportsParticipantTranscription());
  const [listening, setListening] = useState(() =>
    supportsParticipantTranscription(),
  );
  const [recording, setRecording] = useState(false);
  const [heard, setHeard] = useState("");
  const [heardBy, setHeardBy] = useState("");
  const [reply, setReply] = useState<PaigeAnswer | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [visualUrl, setVisualUrl] = useState("");
  const [visualModel, setVisualModel] = useState("");
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualFailed, setVisualFailed] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const transcriberRef = useRef<DeepgramParticipantTranscriber | null>(null);
  const transcriptHandlerRef = useRef<(result: ParticipantTranscript) => void>(
    () => {},
  );
  const speakingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mouthAudioContextRef = useRef<AudioContext | null>(null);
  const mouthAnimationFrameRef = useRef<number | null>(null);
  const finishSpeechRef = useRef<(() => void) | null>(null);
  const pushToTalkHeldRef = useRef(false);
  const currentInteractionIdRef = useRef("");
  const interactionUpdatedAtRef = useRef(0);
  const presentationInteractionIdRef = useRef("");
  const presentationQuestionRef = useRef("");
  const presentationSpeakerRef = useRef("");
  const presentationUpdatedAtRef = useRef(0);
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

  useEffect(() => {
    const image = new Image();
    image.decoding = "async";
    image.src = PREPARED_Q2_VISUAL_PATH;
  }, []);

  const clearVisual = useCallback(() => {
    if (visualUrlRef.current) URL.revokeObjectURL(visualUrlRef.current);
    visualUrlRef.current = "";
    imageBlobRef.current = null;
    setVisualUrl("");
    setVisualModel("");
    setVisualLoading(false);
    setVisualFailed(false);
  }, []);

  const installVisual = useCallback(
    (blob: Blob, name: string, interactionId: string, model?: string) => {
      if (interactionId !== presentationInteractionIdRef.current) return;
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
      setVisualFailed(false);
    },
    [],
  );

  const stopMouthTracking = useCallback(() => {
    if (mouthAnimationFrameRef.current !== null) {
      cancelAnimationFrame(mouthAnimationFrameRef.current);
      mouthAnimationFrameRef.current = null;
    }
    const context = mouthAudioContextRef.current;
    mouthAudioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }
    setMouthLevel(0);
  }, []);

  const startMouthTracking = useCallback(
    async (audio: HTMLAudioElement) => {
      stopMouthTracking();
      try {
        const context = new AudioContext({ latencyHint: "interactive" });
        const source = context.createMediaElementSource(audio);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.45;
        source.connect(analyser);
        analyser.connect(context.destination);
        mouthAudioContextRef.current = context;
        await context.resume();

        const waveform = new Uint8Array(analyser.fftSize);
        let smoothed = 0;
        const track = () => {
          if (
            mouthAudioContextRef.current !== context ||
            audio.paused ||
            audio.ended
          ) {
            setMouthLevel(0);
            return;
          }
          analyser.getByteTimeDomainData(waveform);
          let energy = 0;
          for (const sample of waveform) {
            const centered = (sample - 128) / 128;
            energy += centered * centered;
          }
          const rms = Math.sqrt(energy / waveform.length);
          const target = Math.min(1, Math.max(0, (rms - 0.018) * 11));
          smoothed = smoothed * 0.58 + target * 0.42;
          setMouthLevel(smoothed);
          mouthAnimationFrameRef.current = requestAnimationFrame(track);
        };
        mouthAnimationFrameRef.current = requestAnimationFrame(track);
      } catch {
        stopMouthTracking();
      }
    },
    [stopMouthTracking],
  );

  const stopSpeech = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) audio.pause();
    stopMouthTracking();
    finishSpeechRef.current?.();
    setSpeaking(false);
    speakingRef.current = false;
  }, [stopMouthTracking]);

  const speak = useCallback(
    async (text: string, interactionId: string, revealAnswer: () => void) => {
      stopSpeech();
      const controller = new AbortController();
      speechAbortRef.current = controller;
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
        await startMouthTracking(audio);

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
        stopMouthTracking();
        setSpeaking(false);
        speakingRef.current = false;
      }
    },
    [startMouthTracking, stopMouthTracking, stopSpeech],
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

  const applyThinking = useCallback(
    (
      interactionId: string,
      question: string,
      speaker: string,
      at: number,
      abortCurrentRequest = true,
    ) => {
      if (at < interactionUpdatedAtRef.current) return;
      if (abortCurrentRequest) {
        requestRef.current?.abort();
        requestRef.current = null;
      }
      stopSpeech();
      interactionUpdatedAtRef.current = at;
      currentInteractionIdRef.current = interactionId;
      setHeard(question);
      setHeardBy(speaker);
      setError("");
      setThinking(true);
    },
    [stopSpeech],
  );

  const applyAnswer = useCallback(
    (
      interactionId: string,
      question: string,
      speaker: string,
      answer: PaigeAnswer,
      at: number,
      playAudio = true,
    ) => {
      if (at < interactionUpdatedAtRef.current) return;
      interactionUpdatedAtRef.current = at;
      currentInteractionIdRef.current = interactionId;
      historyRef.current = appendConversationTurn(historyRef.current, {
        question,
        answer: answer.answer,
      });
      const visualRequested = shouldGenerateVisual(question, answer);
      const replacePresentation =
        visualRequested || isGrounded(answer) || !isGrounded(replyRef.current);

      if (replacePresentation) {
        if (presentationInteractionIdRef.current !== interactionId) {
          clearVisual();
        }
        presentationInteractionIdRef.current = interactionId;
        presentationQuestionRef.current = question;
        presentationSpeakerRef.current = speaker;
        presentationUpdatedAtRef.current = at;
        setVisualLoading(visualRequested);
        setVisualFailed(false);
      }

      const reveal = () => {
        if (replacePresentation) {
          replyRef.current = answer;
          setReply(answer);
        }
        setThinking(false);
      };
      if (playAudio) {
        void speak(answer.answer, interactionId, reveal);
      }
      else reveal();
    },
    [clearVisual, speak],
  );

  const generateSharedVisual = useCallback(
    async (
      interactionId: string,
      question: string,
      answer: PaigeAnswer,
      kind: VisualRequestKind,
    ) => {
      try {
        const preparedVisual = preparedVisualForAnswer(question, answer);
        const response = preparedVisual
          ? await fetch(preparedVisual.path, { cache: "force-cache" })
          : await fetch("/api/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                topic: question,
                answer: answer.answer,
                kind,
                chart: answer.chart,
              }),
            });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || "Image generation failed");
        }
        const blob = await response.blob();
        const contentType =
          response.headers.get("content-type") || blob.type || "image/png";
        const model =
          preparedVisual?.model ||
          response.headers.get("x-paige-image-model") ||
          "AI";
        const name = sharedImageFileName(
          interactionId,
          model,
          contentType,
        );
        installVisual(blob, name, interactionId, model);
        const file = new File([blob], name, { type: contentType });
        await room.localParticipant.sendFile(file, {
          topic: PAIGE_IMAGE_TOPIC,
          mimeType: contentType,
        });
        await publishEvent({
          ...eventBase(),
          type: "image",
          interactionId,
          status: "ready",
          model,
          imageName: name,
        });
      } catch (reason) {
        console.error("[paige] shared image generation failed", reason);
        if (presentationInteractionIdRef.current === interactionId) {
          setVisualLoading(false);
          setVisualFailed(true);
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
    async (command: string, speaker = localIdentity) => {
      const q = command.trim();
      if (!q) return;

      requestRef.current?.abort();
      const interactionId = crypto.randomUUID();
      const thinkingEvent: PaigeRoomEvent = {
        ...eventBase(),
        type: "thinking",
        interactionId,
        question: q,
        speaker,
        sessionActive: false,
      };
      applyThinking(interactionId, q, speaker, thinkingEvent.at, false);
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
          speaker,
          answer: body,
          sessionActive: false,
        };
        applyAnswer(interactionId, q, speaker, body, answerEvent.at);
        void publishEvent(answerEvent);
        const visualRequest = visualRequestForAnswer(q, body);
        if (visualRequest) {
          void generateSharedVisual(interactionId, q, body, visualRequest.kind);
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
      localIdentity,
      publishEvent,
    ],
  );

  const handleTranscript = useCallback(
    (transcript: string, speaker: string) => {
      const command = transcript.trim();
      if (!command) return;
      setHeard(command);
      setHeardBy(speaker);
      void publishEvent({
        ...eventBase(),
        type: "transcript",
        speaker,
        text: command,
      });
      stopSpeech();
      void ask(command, speaker);
    },
    [ask, eventBase, publishEvent, stopSpeech],
  );

  const handleInterruptionCandidate = useCallback(
    (result: ParticipantTranscript) => {
      if (
        !speakingRef.current ||
        result.words < 3 ||
        !isSubstantiveTranscript(result.transcript)
      ) {
        return;
      }
      stopSpeech();
      void publishEvent({
        ...eventBase(),
        type: "interrupt",
        interactionId: currentInteractionIdRef.current || undefined,
      });
    },
    [eventBase, publishEvent, stopSpeech],
  );

  useEffect(() => {
    transcriptHandlerRef.current = (result) => {
      handleTranscript(result.transcript, result.speaker);
    };
    return () => {
      transcriptHandlerRef.current = () => {};
    };
  }, [handleTranscript]);

  useEffect(() => {
    if (!supported) return;

    const transcriber = new DeepgramParticipantTranscriber({
      liveKitToken,
      getTrack: () =>
        room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
          ?.mediaStreamTrack ?? null,
      onTranscript: (result) => transcriptHandlerRef.current(result),
      onInterruptionCandidate: handleInterruptionCandidate,
      onError: (message) => setError(message),
    });
    transcriberRef.current = transcriber;

    return () => {
      requestRef.current?.abort();
      stopSpeech();
      transcriber.dispose();
      if (transcriberRef.current === transcriber) {
        transcriberRef.current = null;
      }
    };
  }, [
    handleInterruptionCandidate,
    liveKitToken,
    room,
    stopSpeech,
    supported,
  ]);

  useEffect(() => {
    const handleImmediateInterrupt = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextEntryKeyboardTarget(event.target) ||
        !speakingRef.current
      ) {
        return;
      }
      event.preventDefault();
      stopSpeech();
      void publishEvent({
        ...eventBase(),
        type: "interrupt",
        interactionId: currentInteractionIdRef.current || undefined,
      });
    };

    window.addEventListener("keydown", handleImmediateInterrupt);
    return () => window.removeEventListener("keydown", handleImmediateInterrupt);
  }, [eventBase, publishEvent, stopSpeech]);

  useEffect(() => {
    if (!supported || !listening) return;

    const cancelRecording = () => {
      if (!pushToTalkHeldRef.current) return;
      pushToTalkHeldRef.current = false;
      setRecording(false);
      transcriberRef.current?.cancelPushToTalk();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (pushToTalkHeldRef.current) {
        event.preventDefault();
        return;
      }
      if (event.repeat || isTextEntryKeyboardTarget(event.target)) return;

      event.preventDefault();
      pushToTalkHeldRef.current = true;
      setRecording(true);
      transcriberRef.current?.beginPushToTalk();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !pushToTalkHeldRef.current) return;
      event.preventDefault();
      pushToTalkHeldRef.current = false;
      setRecording(false);
      transcriberRef.current?.endPushToTalk();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelRecording();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", cancelRecording);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", cancelRecording);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelRecording();
    };
  }, [listening, supported]);

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
          if (presentationInteractionIdRef.current === interactionId) {
            setVisualLoading(false);
            setVisualFailed(true);
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
      return;
    }
    if (event.type === "transcript") {
      setHeard(event.text);
      setHeardBy(event.speaker);
      return;
    }
    if (event.type === "thinking") {
      applyThinking(
        event.interactionId,
        event.question,
        event.speaker,
        event.at,
      );
      return;
    }
    if (event.type === "answer") {
      applyAnswer(
        event.interactionId,
        event.question,
        event.speaker,
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
        event.interactionId === presentationInteractionIdRef.current &&
        event.status === "failed"
      ) {
        setVisualLoading(false);
        setVisualFailed(true);
      }
      if (
        event.interactionId === presentationInteractionIdRef.current &&
        event.status === "ready" &&
        event.model
      ) {
        setVisualModel(event.model);
      }
      return;
    }
    if (event.type === "snapshot") {
      if (event.updatedAt < interactionUpdatedAtRef.current) return;
      interactionUpdatedAtRef.current = Math.max(
        interactionUpdatedAtRef.current,
        event.updatedAt,
      );
      currentInteractionIdRef.current = event.currentInteractionId;
      presentationInteractionIdRef.current = event.currentInteractionId;
      presentationQuestionRef.current = event.question;
      presentationSpeakerRef.current = event.speaker;
      presentationUpdatedAtRef.current = event.updatedAt;
      historyRef.current = event.history;
      replyRef.current = event.answer;
      setHeard(event.question);
      setHeardBy(event.speaker);
      setReply(event.answer);
      setThinking(false);
      setVisualLoading(
        event.imageStatus === "loading" ||
          Boolean(event.imageName && !imageBlobRef.current),
      );
      setVisualFailed(event.imageStatus === "failed");
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
        sessionActive: false,
        currentInteractionId: presentationInteractionIdRef.current,
        question: presentationQuestionRef.current,
        answer: replyRef.current,
        history: historyRef.current,
        updatedAt: presentationUpdatedAtRef.current,
        speaker: presentationSpeakerRef.current,
        ...(currentImage ? { imageName: currentImage.name } : {}),
        imageStatus: currentImage
          ? "ready"
          : visualLoading
            ? "loading"
            : visualFailed
              ? "failed"
              : undefined,
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
    applyThinking,
    eventBase,
    publishEvent,
    room,
    stopSpeech,
    visualFailed,
    visualLoading,
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
    if (listening) {
      pushToTalkHeldRef.current = false;
      setRecording(false);
      transcriberRef.current?.setEnabled(false);
      setListening(false);
    } else {
      transcriberRef.current?.setEnabled(true);
      setListening(true);
    }
  }, [listening]);

  const submitChat = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const q = input.trim();
      if (!q) return;
      setHeard(q);
      setHeardBy(room.localParticipant.identity);
      setInput("");
      void ask(q, room.localParticipant.identity);
    },
    [input, ask, room],
  );

  const dismiss = useCallback(() => {
    setReply(null);
    setError("");
  }, []);

  return {
    supported,
    listening,
    recording,
    thinking,
    speaking,
    mouthLevel,
    heard,
    heardBy,
    reply,
    error,
    presenting: Boolean(
      reply &&
        (isGrounded(reply) || visualLoading || visualUrl || visualFailed),
    ),
    visualUrl,
    visualModel,
    visualLoading,
    visualFailed,
    input,
    setInput,
    toggle,
    submitChat,
    ask,
    dismiss,
  };
}

function statusLabel(paige: PaigeState): string {
  if (paige.recording) return "Recording";
  if (paige.speaking) return "Speaking";
  if (paige.thinking) return "Searching";
  if (paige.listening) return "Space to talk";
  return "Idle";
}

function statusColor(paige: PaigeState): string {
  if (paige.recording) return "bg-red-400";
  if (paige.speaking) return "bg-emerald-400";
  if (paige.thinking) return "bg-amber-300";
  if (paige.listening) return "bg-sky-400";
  return "bg-slate-300";
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
  const active =
    paige.recording || paige.speaking || paige.thinking || paige.listening;
  const conversational = paige.reply && !paige.presenting ? paige.reply.answer : "";

  if (!compact && paige.reply && paige.presenting) {
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-foreground/10 bg-white text-foreground">
        <div className="flex items-center justify-between border-b border-foreground/10 bg-[#f1f6ff] px-3 py-2">
          <div className="flex items-center gap-2">
            <PaigeAvatar
              compact
              listening={paige.listening}
              recording={paige.recording}
              thinking={paige.thinking}
              speaking={paige.speaking}
              mouthLevel={paige.mouthLevel}
            />
            <span className={`h-2 w-2 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
            <span className="text-xs font-medium">
              Paige · presenting to everyone
            </span>
          </div>
          <button
            type="button"
            onClick={paige.dismiss}
            className="rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] text-foreground/60 hover:bg-foreground/5"
            aria-label="Close Paige answer"
          >
            Close ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <p className="text-sm font-semibold leading-snug text-foreground">
            {paige.reply.answer}
          </p>
          {(paige.reply.chart ||
            paige.visualLoading ||
            paige.visualUrl ||
            paige.visualFailed) && (
            <AnswerVisual
              chart={paige.reply.chart}
              visualUrl={paige.visualUrl}
              visualModel={paige.visualModel}
              visualLoading={paige.visualLoading}
              visualFailed={paige.visualFailed}
            />
          )}
          {paige.reply.citations[0]?.url && (
            <figure className="overflow-hidden rounded-xl border border-foreground/10 bg-[#f6f9ff]">
              <figcaption className="flex items-center justify-between gap-2 border-b border-foreground/10 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-foreground/75">
                    Source preview ·{" "}
                    {sourceLabel(paige.reply.citations[0].sourceFile)}
                  </p>
                  <p className="text-[9px] text-foreground/40">
                    Cited page {paige.reply.citations[0].page}
                  </p>
                </div>
                <a
                  href={paige.reply.citations[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded border border-foreground/15 px-2 py-1 text-[9px] text-accent hover:bg-accent/5"
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
                    className="rounded border border-accent/20 bg-accent/5 px-1.5 py-1 text-[9px] text-accent hover:bg-accent/10"
                    title={citation.sourceFile}
                  >
                    {sourceLabel(citation.sourceFile)} · p.{citation.page} · Open PDF ↗
                  </a>
                ) : (
                  <span
                    key={`${citation.sourceFile}-${citation.page}`}
                    className="rounded border border-foreground/10 bg-foreground/5 px-1.5 py-1 text-[9px] text-foreground/60"
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
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-foreground/10 bg-gradient-to-br from-[#eaf1ff] via-[#f1f6ff] to-white text-foreground">
      <PaigeAvatar
        compact={compact}
        listening={paige.listening}
        recording={paige.recording}
        thinking={paige.thinking}
        speaking={paige.speaking}
        mouthLevel={paige.mouthLevel}
      />

      {!compact && conversational && (
        <p className="mt-4 max-w-[85%] text-center text-sm leading-snug text-foreground/70">
          “{conversational}”
        </p>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md border border-foreground/10 bg-white/85 px-2 py-1 backdrop-blur">
        <span className={`h-2 w-2 rounded-full ${statusColor(paige)} ${active ? "animate-pulse" : ""}`} />
        <span className={`font-medium ${compact ? "text-[10px]" : "text-xs"}`}>
          Paige{compact ? "" : " · AI copilot"}
        </span>
      </div>
      {!compact && (
        <span className="absolute right-2 top-2 rounded-md border border-foreground/10 bg-white/85 px-2 py-0.5 text-[10px] text-foreground/70 backdrop-blur">
          {statusLabel(paige)}
        </span>
      )}
    </div>
  );
}

// Dismissible control surface: push-to-talk toggle, transcript, typed chat, and errors.
export function PaigeDock({ paige, onClose }: { paige: PaigeState; onClose: () => void }) {
  const active =
    paige.recording || paige.speaking || paige.thinking || paige.listening;
  return (
    <div className="pointer-events-auto absolute bottom-20 right-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-foreground/10 bg-white/90 p-3 text-foreground shadow-2xl shadow-accent/10 backdrop-blur">
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
              className="rounded-full border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5"
            >
              {statusLabel(paige)}
              {active ? "…" : ""}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/60 hover:bg-foreground/5"
            aria-label="Close Paige text window"
          >
            ✕
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-foreground/45">
        {paige.supported
          ? paige.recording
            ? "Recording · release Space to send"
            : "Hold Space to talk · release to send · or type below"
          : "Voice needs Chrome · type below"}
      </p>
      {paige.heard && (
        <p className="mt-1 text-xs text-foreground/70">
          <span className="text-foreground/40">
            {paige.heardBy ? `${paige.heardBy}:` : "heard:"}
          </span>{" "}
          {paige.heard}
        </p>
      )}
      {paige.thinking && <p className="mt-1 text-xs text-amber-600">Searching the company documents…</p>}
      {paige.error && <p className="mt-1 text-xs text-red-500">{paige.error}</p>}

      <form onSubmit={paige.submitChat} className="mt-2 flex gap-1.5">
        <input
          value={paige.input}
          onChange={(e) => paige.setInput(e.target.value)}
          placeholder="Type to Paige…"
          className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-white px-2.5 py-1.5 text-sm outline-none placeholder:text-foreground/30 focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={paige.thinking || paige.speaking}
          className="rounded-lg border border-foreground/20 px-2.5 text-sm hover:bg-foreground/5 disabled:opacity-40"
          aria-label="Send to Paige"
        >
          ↑
        </button>
      </form>
    </div>
  );
}

export function AnswerVisual({
  chart,
  visualUrl = "",
  visualModel = "",
  visualLoading = false,
  visualFailed = false,
}: {
  chart: PaigeChart | null;
  visualUrl?: string;
  visualModel?: string;
  visualLoading?: boolean;
  visualFailed?: boolean;
}) {
  if (visualUrl) {
    const preparedQ2Visual =
      visualModel === PREPARED_Q2_VISUAL_MODEL;
    if (preparedQ2Visual) {
      return (
        <figure className="overflow-hidden rounded-xl border border-foreground/10 bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- shared blob/static visual */}
          <img
            src={visualUrl}
            alt="FDC Q2 2025 actual results compared with the Q2 2026 preliminary forecast"
            className="block h-auto w-full object-contain"
          />
        </figure>
      );
    }

    if (!chart) {
      // No chart means a creative / topic illustration — the generated image IS
      // the visual, so show it crisp and whole instead of as a blurred backdrop.
      return (
        <figure className="relative overflow-hidden rounded-xl border border-foreground/10 bg-white shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs cannot use next/image */}
          <img
            src={visualUrl}
            alt=""
            className="block max-h-72 w-full object-contain"
          />
          <figcaption className="absolute bottom-2 left-2 rounded-md border border-foreground/15 bg-white/80 px-2.5 py-1 text-[9px] font-medium text-foreground/70 backdrop-blur">
            Generated visual by {visualModel || "AI"}
          </figcaption>
        </figure>
      );
    }

    const values = chart.values;
    const maxValue = Math.max(...values, 0);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;
    const zeroFromTop = (maxValue / range) * 100;
    const columnCount = Math.max(1, values.length);

    return (
      <figure className="relative aspect-video overflow-hidden rounded-xl border border-foreground/10 bg-[#eaf1ff]">
        {/* The generated image supplies the visual style. Exact source values stay
            in the HTML overlay so image models cannot rewrite the evidence. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs cannot use next/image */}
        <img
          src={visualUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover saturate-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/55 to-transparent" />
        <figcaption className="relative flex h-full flex-col justify-end p-3">
          <div className="rounded-xl border border-foreground/15 bg-white/90 p-3 shadow-sm backdrop-blur">
              <p className="text-xs font-semibold text-foreground">{chart.title}</p>
              <p className="mt-0.5 text-[9px] text-foreground/55">
                {chart.unit} · Exact values from cited PDFs
              </p>
              <div className="relative mt-3 h-24">
                <span
                  className="absolute inset-x-0 border-t border-foreground/25"
                  style={{ top: `${zeroFromTop}%` }}
                />
                <div
                  className="absolute inset-0 grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                  }}
                >
                  {chart.values.map((value, index) => {
                    const height = Math.max(3, (Math.abs(value) / range) * 100);
                    const top =
                      value >= 0
                        ? ((maxValue - value) / range) * 100
                        : zeroFromTop;
                    return (
                      <div
                        key={`${chart.labels[index]}-${index}`}
                        className="relative"
                        title={`${chart.labels[index]}: ${value.toLocaleString()} ${chart.unit}`}
                      >
                        <span
                          className={`absolute inset-x-[18%] rounded-t-sm ${
                            value >= 0
                              ? "bg-gradient-to-t from-accent to-[#60a5fa]"
                              : "bg-gradient-to-b from-amber-400 to-rose-500"
                          }`}
                          style={{ top: `${top}%`, height: `${height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                className="mt-1 grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                }}
              >
                {chart.values.map((value, index) => (
                  <div
                    key={`${chart.labels[index]}-${index}`}
                    className="min-w-0 text-center"
                  >
                    <p className="truncate text-[8px] text-foreground/60">
                      {chart.labels[index]}
                    </p>
                    <p className="text-[10px] font-semibold text-accent">
                      {value.toLocaleString()}{" "}
                      <span className="text-[8px] font-normal text-accent/60">
                        {chart.unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[8px] text-foreground/45">
                Visual by {visualModel || "AI"} · values overlaid from sources
              </p>
            </div>
        </figcaption>
      </figure>
    );
  }

  if (visualLoading || !visualFailed) {
    return (
      <figure className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-accent/20 bg-[#f1f6ff] p-5 text-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
        <p className="mt-3 text-xs font-medium text-accent">
          Give me a moment to create that visual.
        </p>
        <p className="mt-1 text-[9px] text-foreground/40">
          {chart
            ? "The cited PDF values will stay overlaid on the generated image."
            : "MiniMax is generating a 16:9 visual now."}
        </p>
      </figure>
    );
  }

  return (
    <p className="rounded-xl border border-amber-300/40 bg-amber-50 p-3 text-xs text-amber-700">
      AI visual generation failed. The cited answer is still available below.
    </p>
  );
}

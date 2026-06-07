"use client";

export interface ParticipantTranscript {
  transcript: string;
  confidence: number;
  words: number;
  speaker: string;
}

interface ParticipantTranscriberOptions {
  liveKitToken: string;
  getTrack: () => MediaStreamTrack | null;
  onTranscript: (result: ParticipantTranscript) => void;
  onInterruptionCandidate: (result: ParticipantTranscript) => void;
  onError: (message: string) => void;
}

const PRE_ROLL_MS = 350;
const CAPTURE_RETRY_MS = 250;
const FIRST_INTERRUPT_PROBE_MS = 1_200;
const NEXT_INTERRUPT_PROBE_MS = 900;
const TARGET_SAMPLE_RATE = 16_000;

type CompatibleWindow = typeof window & {
  webkitAudioContext?: typeof AudioContext;
};

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const compatibleWindow = window as CompatibleWindow;
  return (
    compatibleWindow.AudioContext ??
    compatibleWindow.webkitAudioContext ??
    null
  );
}

function concatenateSamples(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }
  return samples;
}

function resample(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
): { samples: Float32Array; sampleRate: number } {
  if (inputSampleRate <= targetSampleRate) {
    return { samples, sampleRate: inputSampleRate };
  }

  const ratio = inputSampleRate / targetSampleRate;
  const output = new Float32Array(Math.max(1, Math.floor(samples.length / ratio)));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex] ?? 0;
    }
    output[outputIndex] = sum / (end - start);
  }
  return { samples: output, sampleRate: targetSampleRate };
}

export function encodePcm16Wav(
  chunks: Float32Array[],
  inputSampleRate: number,
  targetSampleRate = TARGET_SAMPLE_RATE,
): Uint8Array<ArrayBuffer> {
  const resampled = resample(
    concatenateSamples(chunks),
    inputSampleRate,
    targetSampleRate,
  );
  const dataBytes = resampled.samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, resampled.sampleRate, true);
  view.setUint32(28, resampled.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < resampled.samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, resampled.samples[index] ?? 0));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return new Uint8Array(buffer);
}

export function supportsParticipantTranscription(): boolean {
  return (
    typeof window !== "undefined" &&
    audioContextConstructor() !== null &&
    typeof MediaStream !== "undefined"
  );
}

export class DeepgramParticipantTranscriber {
  private readonly options: ParticipantTranscriberOptions;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private silentGainNode: GainNode | null = null;
  private clonedTrack: MediaStreamTrack | null = null;
  private preRollChunks: Float32Array[] = [];
  private preRollSamples = 0;
  private utteranceChunks: Float32Array[] = [];
  private utteranceSamples = 0;
  private utteranceActive = false;
  private probeTimer: number | null = null;
  private captureRetryTimer: number | null = null;
  private probeInFlight = false;
  private interruptionDetected = false;
  private enabled = true;
  private disposed = false;
  private pushToTalkActive = false;
  private submissions = Promise.resolve();

  constructor(options: ParticipantTranscriberOptions) {
    this.options = options;
    this.ensureCapture();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.cancelPushToTalk();
      this.teardownCapture();
      return;
    }
    this.ensureCapture();
  }

  beginPushToTalk() {
    if (!this.enabled || this.disposed || this.pushToTalkActive) return;
    this.pushToTalkActive = true;
    this.ensureCapture();
    this.startUtterance();
  }

  endPushToTalk() {
    if (!this.pushToTalkActive) return;
    this.pushToTalkActive = false;
    this.finishUtterance(true);
  }

  cancelPushToTalk() {
    this.pushToTalkActive = false;
    this.finishUtterance(false);
  }

  dispose() {
    this.disposed = true;
    this.cancelPushToTalk();
    this.teardownCapture();
  }

  private ensureCapture() {
    if (
      this.audioContext ||
      this.captureRetryTimer !== null ||
      !this.enabled ||
      this.disposed
    ) {
      return;
    }

    const AudioContextClass = audioContextConstructor();
    const sourceTrack = this.options.getTrack();
    if (
      !AudioContextClass ||
      !sourceTrack ||
      sourceTrack.readyState !== "live" ||
      !sourceTrack.enabled
    ) {
      this.scheduleCaptureRetry();
      return;
    }

    try {
      const clonedTrack = sourceTrack.clone();
      const context = new AudioContextClass({ latencyHint: "interactive" });
      const source = context.createMediaStreamSource(
        new MediaStream([clonedTrack]),
      );
      const processor = context.createScriptProcessor(2_048, 1, 1);
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        this.captureSamples(copy);
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(context.destination);

      this.audioContext = context;
      this.sourceNode = source;
      this.processorNode = processor;
      this.silentGainNode = silentGain;
      this.clonedTrack = clonedTrack;
      clonedTrack.addEventListener(
        "ended",
        () => {
          if (this.clonedTrack !== clonedTrack) return;
          this.teardownCapture();
          this.scheduleCaptureRetry();
        },
        { once: true },
      );
      void context.resume().catch(() => {
        // Browsers may briefly suspend audio until the room receives a gesture.
      });
      if (this.pushToTalkActive) this.startUtterance();
    } catch {
      this.teardownCapture();
      this.options.onError("Deepgram microphone capture failed.");
      this.scheduleCaptureRetry();
    }
  }

  private scheduleCaptureRetry() {
    if (
      this.captureRetryTimer !== null ||
      !this.enabled ||
      this.disposed ||
      typeof window === "undefined"
    ) {
      return;
    }
    this.captureRetryTimer = window.setTimeout(() => {
      this.captureRetryTimer = null;
      this.ensureCapture();
    }, CAPTURE_RETRY_MS);
  }

  private captureSamples(samples: Float32Array) {
    if (!this.enabled || this.disposed) return;
    if (this.utteranceActive) {
      this.utteranceChunks.push(samples);
      this.utteranceSamples += samples.length;
      return;
    }

    this.preRollChunks.push(samples);
    this.preRollSamples += samples.length;
    const sampleRate = this.audioContext?.sampleRate ?? 48_000;
    const maxPreRollSamples = Math.ceil((sampleRate * PRE_ROLL_MS) / 1_000);
    while (
      this.preRollSamples > maxPreRollSamples &&
      this.preRollChunks.length > 1
    ) {
      const removed = this.preRollChunks.shift();
      this.preRollSamples -= removed?.length ?? 0;
    }
  }

  private startUtterance() {
    if (this.utteranceActive || this.disposed || !this.audioContext) return;
    void this.audioContext.resume().catch(() => {});
    this.utteranceChunks = [...this.preRollChunks];
    this.utteranceSamples = this.preRollSamples;
    this.preRollChunks = [];
    this.preRollSamples = 0;
    this.utteranceActive = true;
    this.interruptionDetected = false;
    this.scheduleInterruptProbe(FIRST_INTERRUPT_PROBE_MS);
  }

  private finishUtterance(submit = true) {
    this.clearTimers();
    if (!this.utteranceActive) return;
    this.utteranceActive = false;
    const chunks = this.utteranceChunks;
    const samples = this.utteranceSamples;
    this.utteranceChunks = [];
    this.utteranceSamples = 0;
    if (submit && samples > 0 && !this.disposed) {
      const wav = encodePcm16Wav(
        chunks,
        this.audioContext?.sampleRate ?? 48_000,
      );
      this.enqueueTranscription(new Blob([wav], { type: "audio/wav" }));
    }
  }

  private teardownCapture() {
    if (this.captureRetryTimer !== null) {
      window.clearTimeout(this.captureRetryTimer);
      this.captureRetryTimer = null;
    }
    if (this.processorNode) this.processorNode.onaudioprocess = null;
    this.sourceNode?.disconnect();
    this.processorNode?.disconnect();
    this.silentGainNode?.disconnect();
    this.clonedTrack?.stop();
    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.silentGainNode = null;
    this.clonedTrack = null;
    this.preRollChunks = [];
    this.preRollSamples = 0;
  }

  private enqueueTranscription(blob: Blob) {
    this.submissions = this.submissions
      .then(async () => {
        const result = await this.requestTranscript(blob);
        if (result.transcript.trim()) this.options.onTranscript(result);
      })
      .catch((reason) => {
        if (!this.disposed) {
          this.options.onError(
            reason instanceof Error
              ? reason.message
              : "Deepgram transcription failed",
          );
        }
      });
  }

  private scheduleInterruptProbe(delay: number) {
    if (this.probeTimer !== null || this.interruptionDetected) return;
    this.probeTimer = window.setTimeout(() => {
      this.probeTimer = null;
      void this.probeForInterruption();
    }, delay);
  }

  private async probeForInterruption() {
    if (
      this.disposed ||
      !this.enabled ||
      !this.pushToTalkActive ||
      this.probeInFlight ||
      this.utteranceSamples === 0 ||
      this.interruptionDetected
    ) {
      return;
    }

    this.probeInFlight = true;
    const wav = encodePcm16Wav(
      [...this.utteranceChunks],
      this.audioContext?.sampleRate ?? 48_000,
    );
    try {
      const result = await this.requestTranscript(
        new Blob([wav], { type: "audio/wav" }),
      );
      if (result.words >= 3 && result.transcript.trim()) {
        this.interruptionDetected = true;
        this.options.onInterruptionCandidate(result);
      }
    } catch {
      // The final utterance request still provides a reliable fallback.
    } finally {
      this.probeInFlight = false;
      if (
        this.pushToTalkActive &&
        !this.interruptionDetected &&
        !this.disposed
      ) {
        this.scheduleInterruptProbe(NEXT_INTERRUPT_PROBE_MS);
      }
    }
  }

  private async requestTranscript(blob: Blob): Promise<ParticipantTranscript> {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.liveKitToken}`,
        "Content-Type": blob.type || "audio/wav",
      },
      body: blob,
    });
    const result = (await response.json()) as ParticipantTranscript & {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(result.error || "Deepgram transcription failed");
    }
    return result;
  }

  private clearTimers() {
    if (this.probeTimer !== null) window.clearTimeout(this.probeTimer);
    this.probeTimer = null;
  }
}

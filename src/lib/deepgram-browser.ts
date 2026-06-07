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

const SILENCE_GRACE_MS = 900;
const MAX_UTTERANCE_MS = 45_000;
const FIRST_INTERRUPT_PROBE_MS = 1_200;
const NEXT_INTERRUPT_PROBE_MS = 900;

function preferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function supportsParticipantTranscription(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof MediaStream !== "undefined"
  );
}

export class DeepgramParticipantTranscriber {
  private readonly options: ParticipantTranscriberOptions;
  private recorder: MediaRecorder | null = null;
  private clonedTrack: MediaStreamTrack | null = null;
  private chunks: Blob[] = [];
  private stopTimer: number | null = null;
  private maxTimer: number | null = null;
  private probeTimer: number | null = null;
  private probeInFlight = false;
  private interruptionDetected = false;
  private enabled = true;
  private disposed = false;
  private locallySpeaking = false;
  private submissions = Promise.resolve();

  constructor(options: ParticipantTranscriberOptions) {
    this.options = options;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.finishUtterance();
    else if (this.locallySpeaking) this.startUtterance();
  }

  setSpeaking(speaking: boolean) {
    this.locallySpeaking = speaking;
    if (!this.enabled || this.disposed) return;
    if (speaking) {
      this.clearStopTimer();
      this.startUtterance();
      return;
    }
    if (!this.recorder || this.stopTimer !== null) return;
    this.stopTimer = window.setTimeout(
      () => this.finishUtterance(),
      SILENCE_GRACE_MS,
    );
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    this.finishUtterance();
  }

  private startUtterance() {
    if (this.recorder || this.disposed) return;
    const sourceTrack = this.options.getTrack();
    if (!sourceTrack || sourceTrack.readyState !== "live" || !sourceTrack.enabled) {
      return;
    }

    this.chunks = [];
    this.interruptionDetected = false;
    this.clonedTrack = sourceTrack.clone();
    const mimeType = preferredMimeType();
    const recorder = new MediaRecorder(
      new MediaStream([this.clonedTrack]),
      mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined,
    );
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onerror = () => {
      this.options.onError("Deepgram microphone capture failed.");
      this.finishUtterance();
    };
    recorder.onstop = () => {
      const blob = new Blob(this.chunks, {
        type: recorder.mimeType || mimeType || "audio/webm",
      });
      this.chunks = [];
      this.clonedTrack?.stop();
      this.clonedTrack = null;
      if (blob.size > 0 && !this.disposed) this.enqueueTranscription(blob);
      if (this.locallySpeaking && this.enabled && !this.disposed) {
        this.startUtterance();
      }
    };
    recorder.start(250);
    this.maxTimer = window.setTimeout(
      () => this.finishUtterance(),
      MAX_UTTERANCE_MS,
    );
    this.scheduleInterruptProbe(FIRST_INTERRUPT_PROBE_MS);
  }

  private finishUtterance() {
    this.clearTimers();
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      this.clonedTrack?.stop();
      this.clonedTrack = null;
    }
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
      !this.locallySpeaking ||
      this.probeInFlight ||
      this.chunks.length === 0 ||
      this.interruptionDetected
    ) {
      return;
    }

    this.probeInFlight = true;
    const blob = new Blob([...this.chunks], {
      type: this.recorder?.mimeType || "audio/webm",
    });
    try {
      const result = await this.requestTranscript(blob);
      if (result.words >= 3 && result.transcript.trim()) {
        this.interruptionDetected = true;
        this.options.onInterruptionCandidate(result);
      }
    } catch {
      // The final utterance request still provides a reliable fallback.
    } finally {
      this.probeInFlight = false;
      if (
        this.locallySpeaking &&
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
        "Content-Type": blob.type || "audio/webm",
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

  private clearStopTimer() {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
  }

  private clearTimers() {
    this.clearStopTimer();
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer);
    this.maxTimer = null;
    if (this.probeTimer !== null) window.clearTimeout(this.probeTimer);
    this.probeTimer = null;
  }
}

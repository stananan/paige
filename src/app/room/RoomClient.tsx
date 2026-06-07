"use client";

import {
  ControlBar,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { useState } from "react";
import { PAIGE_ROOM } from "@/lib/room";
import { PaigeDock, PaigeTile, usePaige, type PaigeState } from "./PaigeListener";

type ConnInfo = { token: string; serverUrl: string };

export default function RoomClient() {
  const [conn, setConn] = useState<ConnInfo | null>(null);
  const [name, setName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/token?room=${PAIGE_ROOM}&username=${encodeURIComponent(name.trim() || "guest")}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get a token");
      setConn({ token: data.token, serverUrl: data.serverUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join");
      setConnecting(false);
    }
  }

  if (!conn) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6">
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[60vh]" />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-foreground/10 bg-white p-7 shadow-xl shadow-accent/10">
          <div className="text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent text-lg font-bold text-white shadow-lg shadow-accent/25">
              P
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Join the meeting</h1>
            <p className="mt-1 text-sm text-muted">
              Open this in two tabs to be two people. Paige joins as the third.
            </p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && join()}
            placeholder="Your name"
            autoFocus
            className="rounded-xl border border-foreground/15 bg-white px-4 py-3 text-base outline-none focus:border-accent/50"
          />
          <button
            onClick={join}
            disabled={connecting || !name.trim()}
            className="rounded-xl bg-accent px-4 py-3 font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-strong disabled:opacity-40"
          >
            {connecting ? "Connecting…" : "Join room →"}
          </button>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.serverUrl}
      connect
      video
      audio
      data-lk-theme="default"
      style={{ height: "100dvh" }}
      onError={(e) => setError(e.message)}
      onDisconnected={() => {
        setConn(null);
        setConnecting(false);
      }}
    >
      <PaigeRoom liveKitToken={conn.token} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// Each browser hosts a synchronized Paige client. LiveKit data and byte streams
// keep the answer, chart, source preview, and generated backdrop shared.
function PaigeRoom({ liveKitToken }: { liveKitToken: string }) {
  const paige = usePaige(liveKitToken);
  const [dockOpen, setDockOpen] = useState(false);

  return (
    <div className="relative flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Conference paige={paige} />
      </div>
      <ControlBar />
      {dockOpen ? (
        <PaigeDock paige={paige} onClose={() => setDockOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setDockOpen(true)}
          className="absolute bottom-20 right-4 z-20 rounded-full border border-white/20 bg-accent px-3 py-2 text-xs font-medium text-white shadow-xl shadow-accent/25 backdrop-blur transition hover:bg-accent-strong"
          aria-label="Open Paige text window"
        >
          Open Paige chat
        </button>
      )}
    </div>
  );
}

function gridColsClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-3 lg:grid-cols-4";
}

function Conference({ paige }: { paige: PaigeState }) {
  // withPlaceholder keeps a tile for participants whose camera is off, so the
  // humans always show even before video is published. Paige is rendered as her
  // own tile alongside them.
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const humanTiles = tracks.map((track, index) => {
    const sid = "publication" in track && track.publication ? track.publication.trackSid : "ph";
    return (
      <div
        key={`${track.participant.identity}:${String(track.source)}:${sid}:${index}`}
        className="min-h-0 min-w-0 overflow-hidden rounded-lg [&_.lk-participant-tile]:h-full [&_.lk-participant-tile]:w-full"
      >
        <ParticipantTile trackRef={track} />
      </div>
    );
  });

  return (
    <div className={`grid h-full auto-rows-fr gap-2 p-2 ${gridColsClass(tracks.length + 1)}`}>
      {humanTiles}
      <div className="min-h-0 min-w-0 overflow-hidden rounded-lg">
        <PaigeTile paige={paige} />
      </div>
    </div>
  );
}

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
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Join the meeting</h1>
            <p className="mt-1 text-sm text-foreground/60">
              Open this in two tabs to be two people. Paige joins as the third.
            </p>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && join()}
            placeholder="Your name"
            autoFocus
            className="rounded-xl border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-foreground/40"
          />
          <button
            onClick={join}
            disabled={connecting || !name.trim()}
            className="rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
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
      <PaigeRoom />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// Hosts the single Paige brain so the equal-sized grid tile and control dock share
// one state.
function PaigeRoom() {
  const paige = usePaige();
  const [dockOpen, setDockOpen] = useState(true);

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
          className="absolute bottom-20 right-4 z-20 rounded-full border border-white/15 bg-black/75 px-3 py-2 text-xs font-medium text-white shadow-xl backdrop-blur hover:bg-black/90"
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

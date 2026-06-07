"use client";

import {
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { useState } from "react";
import { PAIGE_ROOM } from "@/lib/room";
import PaigeListener from "./PaigeListener";

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
      <div className="relative flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <Conference />
        </div>
        <ControlBar />
        <PaigeListener />
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function Conference() {
  // withPlaceholder keeps a tile for participants whose camera is off (so You,
  // your friend, and Paige all show up even before video is published).
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <GridLayout tracks={tracks} style={{ height: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

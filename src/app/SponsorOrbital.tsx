"use client";

import {
  Search,
  Video,
  FileText,
  AudioLines,
  Image as ImageIcon,
  BrainCircuit,
} from "lucide-react";
import RadialOrbitalTimeline, {
  type OrbitalItem,
} from "@/components/ui/radial-orbital-timeline";

// The six sponsors, wired in the order data actually flows through Paige:
// Unsiloed parses → Moss indexes/retrieves → TrueFoundry answers → MiniMax
// speaks + Qwen illustrates, all inside the LiveKit room. relatedIds draw
// those connections when a node is opened.
const SPONSORS: OrbitalItem[] = [
  {
    id: 1,
    title: "LiveKit",
    date: "Meeting room",
    category: "Realtime",
    icon: Video,
    status: "completed",
    energy: 85,
    relatedIds: [4],
    content:
      "Runs the live meeting room: real-time video, audio, and transport. A server route mints short-lived access tokens so you, a teammate, and Paige all share one room.",
  },
  {
    id: 2,
    title: "Unsiloed",
    date: "PDF parsing",
    category: "Ingestion",
    icon: FileText,
    status: "in-progress",
    energy: 70,
    relatedIds: [3],
    content:
      "Parses the source PDFs during offline ingestion, turning each page into clean, structured text. That page-aware output becomes the citable chunks Paige later retrieves.",
  },
  {
    id: 3,
    title: "Moss",
    date: "Semantic index",
    category: "Retrieval",
    icon: Search,
    status: "completed",
    energy: 100,
    relatedIds: [2, 6],
    content:
      "Semantic retrieval over the company documents — Paige queries the Moss index to pull the exact passages that answer your question. Every cited answer is grounded in what Moss returns.",
  },
  {
    id: 4,
    title: "MiniMax",
    date: "Text-to-speech",
    category: "Voice",
    icon: AudioLines,
    status: "in-progress",
    energy: 60,
    relatedIds: [6],
    content:
      "Gives Paige her voice. The /api/tts route synthesizes her spoken answer with MiniMax's T2A model and streams MP3 back to the browser.",
  },
  {
    id: 5,
    title: "Qwen",
    date: "Image gen",
    category: "Imagery",
    icon: ImageIcon,
    status: "completed",
    energy: 55,
    relatedIds: [6],
    content:
      "Generates the visual that drops in a beat after the answer, via Alibaba DashScope's z-image-turbo model.",
  },
  {
    id: 6,
    title: "TrueFoundry",
    date: "LLM gateway",
    category: "Answer LLM",
    icon: BrainCircuit,
    status: "in-progress",
    energy: 90,
    relatedIds: [3, 4, 5],
    content:
      "Fronts the answer LLM. Retrieved context is sent through TrueFoundry's gateway to GPT-5.4 Mini, which writes the concise, cited reply.",
  },
];

export default function SponsorOrbital() {
  return (
    <section className="relative z-20 -mt-[42vh] h-screen w-full overflow-hidden">
      {/* Soft blue glow behind the wheel, matching the hero */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70vh] w-[70vh] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,0.10), transparent 70%)",
        }}
      />

      <RadialOrbitalTimeline timelineData={SPONSORS} />
    </section>
  );
}

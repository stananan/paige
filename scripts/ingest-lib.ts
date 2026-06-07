import { createHash } from "node:crypto";
import type { DocumentInfo } from "@moss-dev/moss";

export interface UnsiloedSegment {
  segment_id?: string;
  segment_type?: string;
  content?: string;
  markdown?: string;
  page_number?: number;
}

export interface UnsiloedChunk {
  chunk_id: string;
  embed: string;
  segments: UnsiloedSegment[];
}

export interface UnsiloedParseResult {
  job_id: string;
  status: string;
  file_name: string;
  message?: string;
  page_count?: number;
  total_chunks: number;
  credit_used?: number;
  chunks: UnsiloedChunk[];
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 2_800;
const DEFAULT_OVERLAP_CHARS = 280;

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageNumber(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

export function splitText(
  input: string,
  {
    maxChars = DEFAULT_MAX_CHARS,
    overlapChars = DEFAULT_OVERLAP_CHARS,
  }: ChunkOptions = {},
): string[] {
  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  if (maxChars < 200) throw new Error("maxChars must be at least 200");
  if (overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("overlapChars must be between 0 and maxChars - 1");
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const minimumBreak = start + Math.floor(maxChars * 0.6);
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const lineBreak = text.lastIndexOf("\n", end);
      const spaceBreak = text.lastIndexOf(" ", end);
      const bestBreak = [paragraphBreak, lineBreak, spaceBreak].find(
        (candidate) => candidate >= minimumBreak,
      );
      if (bestBreak !== undefined) end = bestBreak;
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    const nextStart = Math.max(end - overlapChars, start + 1);
    start = nextStart;
  }

  return chunks;
}

function stableDocumentId(
  sourceFile: string,
  unsiloedChunkId: string,
  page: number,
  part: number,
  text: string,
): string {
  const digest = createHash("sha256")
    .update([sourceFile, unsiloedChunkId, String(page), String(part), text].join("\0"))
    .digest("hex")
    .slice(0, 20);
  return `${sourceFile.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-${digest}`;
}

export function toMossDocuments(
  result: UnsiloedParseResult,
  sourceFile: string,
  options: ChunkOptions = {},
): DocumentInfo[] {
  const documents: DocumentInfo[] = [];

  for (const chunk of result.chunks) {
    const byPage = new Map<number, string[]>();
    for (const segment of chunk.segments ?? []) {
      const text = normalizeText(segment.markdown || segment.content || "");
      if (!text) continue;
      const page = pageNumber(segment.page_number);
      const pageSegments = byPage.get(page) ?? [];
      pageSegments.push(text);
      byPage.set(page, pageSegments);
    }

    if (byPage.size === 0 && normalizeText(chunk.embed)) {
      if (result.page_count && result.page_count > 1) {
        throw new Error(
          `Unsiloed chunk ${chunk.chunk_id} has no page metadata in a multi-page document`,
        );
      }
      byPage.set(1, [normalizeText(chunk.embed)]);
    }

    for (const [page, pageSegments] of byPage) {
      const parts = splitText(pageSegments.join("\n\n"), options);
      parts.forEach((text, partIndex) => {
        documents.push({
          id: stableDocumentId(sourceFile, chunk.chunk_id, page, partIndex, text),
          text,
          metadata: {
            sourceFile,
            page: String(page),
            pages: String(page),
            unsiloedChunkId: chunk.chunk_id,
            chunkPart: `${partIndex + 1}/${parts.length}`,
            documentType: "pdf",
          },
        });
      });
    }
  }

  return documents;
}

export function verificationQuery(documents: DocumentInfo[]): string {
  const text = documents[0]?.text;
  if (!text) throw new Error("Cannot build a verification query without indexed documents");
  const firstLine = text.split("\n").find((line) => line.trim().length >= 12) ?? text;
  return firstLine.replace(/[#*|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function normalizedMetadata(metadata: DocumentInfo["metadata"]): string {
  return JSON.stringify(
    Object.entries(metadata ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function sameDocument(left: DocumentInfo, right: DocumentInfo): boolean {
  return (
    left.text === right.text && normalizedMetadata(left.metadata) === normalizedMetadata(right.metadata)
  );
}

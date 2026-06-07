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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseUnsiloedResult(value: unknown): UnsiloedParseResult {
  if (!isRecord(value) || value.status !== "Succeeded") {
    throw new Error("Unsiloed response is not a successful parse result");
  }
  if (
    typeof value.job_id !== "string" ||
    typeof value.file_name !== "string" ||
    !Number.isInteger(value.total_chunks) ||
    !Array.isArray(value.chunks)
  ) {
    throw new Error("Unsiloed response is missing required result fields");
  }
  if (
    value.page_count !== undefined &&
    (!Number.isInteger(value.page_count) || Number(value.page_count) < 1)
  ) {
    throw new Error("Unsiloed response has an invalid page_count");
  }

  for (const [chunkIndex, chunk] of value.chunks.entries()) {
    if (
      !isRecord(chunk) ||
      typeof chunk.chunk_id !== "string" ||
      typeof chunk.embed !== "string" ||
      !Array.isArray(chunk.segments)
    ) {
      throw new Error(`Unsiloed response has an invalid chunk at index ${chunkIndex}`);
    }
    for (const [segmentIndex, segment] of chunk.segments.entries()) {
      if (!isRecord(segment)) {
        throw new Error(
          `Unsiloed response has an invalid segment at chunk ${chunkIndex}, index ${segmentIndex}`,
        );
      }
      if (
        (segment.content !== undefined && typeof segment.content !== "string") ||
        (segment.markdown !== undefined && typeof segment.markdown !== "string") ||
        (segment.page_number !== undefined &&
          (!Number.isInteger(segment.page_number) || Number(segment.page_number) < 1))
      ) {
        throw new Error(
          `Unsiloed response has invalid segment fields at chunk ${chunkIndex}, index ${segmentIndex}`,
        );
      }
    }
  }

  return value as unknown as UnsiloedParseResult;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitText(
  input: string,
  {
    maxChars = DEFAULT_MAX_CHARS,
    overlapChars = DEFAULT_OVERLAP_CHARS,
  }: ChunkOptions = {},
): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 200) {
    throw new Error("maxChars must be an integer of at least 200");
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("overlapChars must be between 0 and maxChars - 1");
  }

  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

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
  page: number,
  part: number,
  text: string,
): string {
  const digest = createHash("sha256")
    .update([sourceFile, String(page), String(part), text].join("\0"))
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
  const byPage = new Map<number, string[]>();

  for (const chunk of result.chunks) {
    let addedSegmentText = false;
    for (const segment of chunk.segments ?? []) {
      const text = normalizeText(segment.markdown || segment.content || "");
      if (!text) continue;
      let page = segment.page_number;
      if (!page) {
        if (result.page_count !== 1) {
          throw new Error(
            `Unsiloed chunk ${chunk.chunk_id} has content without valid page metadata`,
          );
        }
        page = 1;
      }
      if (result.page_count && page > result.page_count) {
        throw new Error(
          `Unsiloed chunk ${chunk.chunk_id} references page ${page} beyond page_count ${result.page_count}`,
        );
      }
      const pageSegments = byPage.get(page) ?? [];
      pageSegments.push(text);
      byPage.set(page, pageSegments);
      addedSegmentText = true;
    }

    const fallbackText = normalizeText(chunk.embed);
    if (!addedSegmentText && fallbackText) {
      if (result.page_count !== 1) {
        throw new Error(
          `Unsiloed chunk ${chunk.chunk_id} has no page metadata in a multi-page document`,
        );
      }
      const pageSegments = byPage.get(1) ?? [];
      pageSegments.push(fallbackText);
      byPage.set(1, pageSegments);
    }
  }

  for (const [page, pageSegments] of byPage) {
    const parts = splitText(pageSegments.join("\n\n"), options);
    parts.forEach((text, partIndex) => {
      documents.push({
        id: stableDocumentId(sourceFile, page, partIndex, text),
        text,
        metadata: {
          sourceFile,
          page: String(page),
          pages: String(page),
          chunkPart: `${partIndex + 1}/${parts.length}`,
          documentType: "pdf",
        },
      });
    });
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

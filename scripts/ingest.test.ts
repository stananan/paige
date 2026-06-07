import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findPdfFiles,
  parseUnsiloedResult,
  sameDocument,
  selectCorpusPdfs,
  splitText,
  toMossDocuments,
  verificationQuery,
  type UnsiloedParseResult,
} from "./ingest-lib";

describe("findPdfFiles", () => {
  test("discovers PDFs in company folders and ignores hidden caches", () => {
    const root = mkdtempSync(join(tmpdir(), "paige-ingest-"));
    try {
      mkdirSync(join(root, "fdc", "finance"), { recursive: true });
      mkdirSync(join(root, ".ingest-cache"), { recursive: true });
      writeFileSync(join(root, "overview.PDF"), "pdf");
      writeFileSync(join(root, "fdc", "finance", "earnings.pdf"), "pdf");
      writeFileSync(join(root, "fdc", "notes.txt"), "text");
      writeFileSync(join(root, ".ingest-cache", "cached.pdf"), "pdf");

      expect(findPdfFiles(root)).toEqual(["fdc/finance/earnings.pdf", "overview.PDF"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("selectCorpusPdfs", () => {
  const files = [
    "acme/annual-report.pdf",
    "acme/incident-log.pdf",
    "fdc/overview.pdf",
  ];

  test("selects one explicit company folder", () => {
    expect(selectCorpusPdfs(files, "acme")).toEqual([
      "acme/annual-report.pdf",
      "acme/incident-log.pdf",
    ]);
  });

  test("rejects ambiguous multi-company ingestion", () => {
    expect(() => selectCorpusPdfs(files)).toThrow("Multiple company corpora found");
  });

  test("rejects path traversal and nested company selectors", () => {
    expect(() => selectCorpusPdfs(files, "../fdc")).toThrow("single data-folder");
    expect(() => selectCorpusPdfs(files, "team/fdc")).toThrow("single data-folder");
  });
});

describe("splitText", () => {
  test("returns short content unchanged", () => {
    expect(splitText("Revenue was $210 million.")).toEqual(["Revenue was $210 million."]);
  });

  test("returns no chunks for blank content", () => {
    expect(splitText(" \n\t ")).toEqual([]);
  });

  test("rejects invalid chunk settings even for short content", () => {
    expect(() => splitText("short", { maxChars: 199 })).toThrow("integer of at least 200");
    expect(() => splitText("short", { maxChars: 200, overlapChars: 200 })).toThrow(
      "between 0 and maxChars - 1",
    );
  });

  test("bounds long chunks and retains overlap", () => {
    const text = Array.from({ length: 120 }, (_, index) => `Revenue line ${index}.`).join(" ");
    const chunks = splitText(text, { maxChars: 240, overlapChars: 40 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 240)).toBe(true);
    expect(chunks.join(" ")).toContain("Revenue line 0.");
    expect(chunks.join(" ")).toContain("Revenue line 119.");
  });
});

describe("toMossDocuments", () => {
  const result: UnsiloedParseResult = {
    job_id: "job-1",
    status: "Succeeded",
    file_name: "report.pdf",
    page_count: 2,
    total_chunks: 1,
    chunks: [
      {
        chunk_id: "chunk-1",
        embed: "Combined fallback text",
        segments: [
          { page_number: 1, markdown: "## Revenue\n2024 revenue was $150 million." },
          { page_number: 2, markdown: "## Revenue\n2025 revenue was $210 million." },
        ],
      },
    ],
  };

  test("creates page-specific documents with citation metadata", () => {
    const documents = toMossDocuments(result, "report.pdf");

    expect(documents).toHaveLength(2);
    expect(documents.map((document) => document.metadata?.page)).toEqual(["1", "2"]);
    expect(documents.every((document) => document.metadata?.sourceFile === "report.pdf")).toBe(
      true,
    );
    expect(documents[0].text).toContain("2024 revenue");
    expect(documents[1].text).toContain("2025 revenue");
  });

  test("produces stable ids and a usable verification query", () => {
    const first = toMossDocuments(result, "report.pdf");
    const reparsed: UnsiloedParseResult = {
      ...result,
      chunks: result.chunks.map((chunk) => ({ ...chunk, chunk_id: "new-provider-uuid" })),
    };
    const second = toMossDocuments(reparsed, "report.pdf");

    expect(first.map((document) => document.id)).toEqual(second.map((document) => document.id));
    expect(first).toEqual(second);
    expect(verificationQuery(first).toLowerCase()).toContain("revenue");
  });

  test("refuses to invent a citation when multi-page metadata is missing", () => {
    const withoutPageMetadata: UnsiloedParseResult = {
      ...result,
      chunks: [{ chunk_id: "chunk-2", embed: "Unattributed content", segments: [] }],
    };

    expect(() => toMossDocuments(withoutPageMetadata, "report.pdf")).toThrow(
      "has no page metadata",
    );
  });

  test("refuses a partially unattributed segment in a multi-page document", () => {
    const partiallyAttributed: UnsiloedParseResult = {
      ...result,
      chunks: [
        {
          chunk_id: "chunk-3",
          embed: "Combined text",
          segments: [
            { page_number: 1, markdown: "Attributed content" },
            { markdown: "Content with no page" },
          ],
        },
      ],
    };

    expect(() => toMossDocuments(partiallyAttributed, "report.pdf")).toThrow(
      "content without valid page metadata",
    );
  });

  test("refuses page metadata beyond the parsed page count", () => {
    const outOfRange: UnsiloedParseResult = {
      ...result,
      chunks: [
        {
          chunk_id: "chunk-4",
          embed: "Out-of-range content",
          segments: [{ page_number: 3, markdown: "Impossible page" }],
        },
      ],
    };

    expect(() => toMossDocuments(outOfRange, "report.pdf")).toThrow("beyond page_count 2");
  });
});

describe("sameDocument", () => {
  test("ignores metadata key order returned by Moss", () => {
    expect(
      sameDocument(
        { id: "1", text: "Revenue", metadata: { sourceFile: "report.pdf", page: "1" } },
        { id: "1", text: "Revenue", metadata: { page: "1", sourceFile: "report.pdf" } },
      ),
    ).toBe(true);
  });
});

describe("parseUnsiloedResult", () => {
  test("rejects malformed successful responses before indexing", () => {
    expect(() =>
      parseUnsiloedResult({
        job_id: "job-1",
        status: "Succeeded",
        file_name: "report.pdf",
        total_chunks: 1,
        chunks: [{ chunk_id: "chunk-1", embed: "text", segments: "not-an-array" }],
      }),
    ).toThrow("invalid chunk");
  });
});

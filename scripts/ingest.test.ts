import { describe, expect, test } from "bun:test";
import {
  sameDocument,
  splitText,
  toMossDocuments,
  verificationQuery,
  type UnsiloedParseResult,
} from "./ingest-lib";

describe("splitText", () => {
  test("returns short content unchanged", () => {
    expect(splitText("Revenue was $210 million.")).toEqual(["Revenue was $210 million."]);
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
    const second = toMossDocuments(result, "report.pdf");

    expect(first.map((document) => document.id)).toEqual(second.map((document) => document.id));
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

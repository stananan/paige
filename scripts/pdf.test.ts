import { describe, expect, test } from "bun:test";
import { createTextPdf } from "./pdf";

describe("createTextPdf", () => {
  test("creates a valid multi-page PDF with extractable text streams", () => {
    const pdf = createTextPdf([
      { title: "Annual report", lines: ["Revenue was $68.4 million."] },
      { title: "Incident log", lines: ["No customer data was lost."] },
    ]);
    const text = pdf.toString("latin1");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(text).toContain("(Revenue was $68.4 million.) Tj");
    expect(text).toContain("xref");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  test("escapes PDF string syntax", () => {
    const text = createTextPdf([
      { title: "Plan (draft)", lines: ["Path C:\\reports and margin (74%)."] },
    ]).toString("latin1");

    expect(text).toContain("Plan \\(draft\\)");
    expect(text).toContain("C:\\\\reports");
    expect(text).toContain("margin \\(74%\\)");
  });
});


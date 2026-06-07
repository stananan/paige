export interface PdfPage {
  title: string;
  lines: string[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MAX_LINE_CHARS = 88;
const MAX_BODY_LINES = 43;

function ascii(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+$/g, "");
}

function escapePdfString(text: string): string {
  return ascii(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(input: string): string[] {
  const line = ascii(input);
  if (!line) return [""];
  if (line.length <= MAX_LINE_CHARS) return [line];

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= MAX_LINE_CHARS) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function pageStream(page: PdfPage, pageNumber: number, pageCount: number): string {
  const bodyLines = page.lines.flatMap(wrapLine);
  if (bodyLines.length > MAX_BODY_LINES) {
    throw new Error(
      `PDF page "${page.title}" has ${bodyLines.length} wrapped lines; maximum is ${MAX_BODY_LINES}`,
    );
  }

  const commands = [
    "BT",
    "/F1 18 Tf",
    `1 0 0 1 ${MARGIN_X} 738 Tm`,
    `(${escapePdfString(page.title)}) Tj`,
    "/F1 8 Tf",
    `1 0 0 1 ${MARGIN_X} 716 Tm`,
    "(FDC CONFIDENTIAL - SYNTHETIC DEMO DATA) Tj",
    "/F1 10 Tf",
  ];

  let y = 686;
  for (const line of bodyLines) {
    commands.push(`1 0 0 1 ${MARGIN_X} ${y} Tm`);
    if (line) commands.push(`(${escapePdfString(line)}) Tj`);
    y -= 14;
  }

  commands.push(
    "/F1 8 Tf",
    `1 0 0 1 ${MARGIN_X} 36 Tm`,
    `(Fake Demo Company | Page ${pageNumber} of ${pageCount}) Tj`,
    "ET",
  );
  return `${commands.join("\n")}\n`;
}

export function createTextPdf(pages: PdfPage[]): Buffer {
  if (pages.length === 0) throw new Error("A PDF must contain at least one page");

  const fontId = 3 + pages.length * 2;
  const objects: string[] = Array.from({ length: fontId + 1 }, () => "");
  const pageIds = pages.map((_, index) => 3 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = pageStream(page, index + 1, pages.length);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`;
  });

  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let output = "%PDF-1.4\n% PAIGE FDC\n";
  const offsets: number[] = Array.from({ length: objects.length }, () => 0);
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id++) {
    output += `${offsets[id].toString().padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(output, "latin1");
}


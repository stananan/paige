import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fdcDocuments } from "../src/data/fdc";
import { createTextPdf } from "./pdf";

const corpusDir = join(import.meta.dirname, "..", "data", "fdc");
const publicDir = join(import.meta.dirname, "..", "public", "demo-company", "fdc");

async function main(): Promise<void> {
  await Promise.all([
    rm(corpusDir, { recursive: true, force: true }),
    rm(publicDir, { recursive: true, force: true }),
  ]);
  await Promise.all([
    mkdir(corpusDir, { recursive: true }),
    mkdir(publicDir, { recursive: true }),
  ]);

  for (const document of fdcDocuments) {
    const pdf = createTextPdf(document.pages);
    await Promise.all([
      writeFile(join(corpusDir, document.fileName), pdf),
      writeFile(join(publicDir, document.fileName), pdf),
    ]);
    console.log(
      `[demo] wrote data/fdc/${document.fileName} (${document.pages.length} pages, ${pdf.byteLength} bytes)`,
    );
  }

  console.log(`[demo] generated ${fdcDocuments.length} FDC documents`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

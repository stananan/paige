import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fdcDocuments } from "../src/data/fdc";
import { createTextPdf } from "./pdf";

const outputDir = join(import.meta.dirname, "..", "data", "fdc");

async function main(): Promise<void> {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const document of fdcDocuments) {
    const outputPath = join(outputDir, document.fileName);
    const pdf = createTextPdf(document.pages);
    await writeFile(outputPath, pdf);
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


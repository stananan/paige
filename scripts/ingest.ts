/**
 * Offline ingest pipeline — run BEFORE the demo, never live on stage.
 *
 *   bun run ingest      (or: bun scripts/ingest.ts)
 *
 * Pipeline (see README build order, Hour 6–9):
 *   1. Read PDFs from /data
 *   2. Unsiloed → parse each PDF to text, KEEPING page numbers (needed for citations)
 *   3. Chunk text, carrying { sourceFile, page } metadata on every chunk
 *   4. Embed + index chunks in Moss so a query returns chunks + source metadata
 *
 * Today this does step 1 only (discovery) so you can verify the corpus is in place.
 * Fill in steps 2–4 once Unsiloed + Moss keys are set in .env.local.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dirname, "..", "data");

function findPdfs(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
}

async function main(): Promise<void> {
  const pdfs = findPdfs();
  console.log(`[ingest] data dir: ${DATA_DIR}`);
  console.log(`[ingest] found ${pdfs.length} PDF(s)`);
  for (const f of pdfs) console.log(`  - ${f}`);

  if (pdfs.length === 0) {
    console.log("\n[ingest] No PDFs yet. Drop the corpus into /data and re-run.");
    return;
  }

  // TODO(step 2): Unsiloed parse → text + page numbers
  // TODO(step 3): chunk with { sourceFile, page } metadata
  // TODO(step 4): embed + index in Moss (index = MOSS_INDEX)
  console.log("\n[ingest] TODO: wire Unsiloed parse → chunk → Moss index (steps 2–4).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

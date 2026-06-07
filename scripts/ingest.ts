import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MossClient, type DocumentInfo } from "@moss-dev/moss";
import {
  sameDocument,
  toMossDocuments,
  type UnsiloedParseResult,
  verificationQuery,
} from "./ingest-lib";

const DATA_DIR = join(import.meta.dirname, "..", "data");
const CACHE_DIR = join(DATA_DIR, ".ingest-cache");
const MOSS_CACHE_DIR = join(DATA_DIR, ".moss-cache");
const UNSILOED_BASE_URL = "https://prod.visionapi.unsiloed.ai";
const DEFAULT_INDEX = "paige-docs";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100;

function findPdfs(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name} (see .env.example)`);
  return value;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function parsePdf(
  fileName: string,
  apiKey: string,
  useCache: boolean,
): Promise<UnsiloedParseResult> {
  const path = join(DATA_DIR, fileName);
  const bytes = await readFile(path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const cachePath = join(CACHE_DIR, `${hash}.json`);

  if (useCache && existsSync(cachePath)) {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as UnsiloedParseResult;
    if (cached.status === "Succeeded") {
      console.log(`[unsiloed] cache hit: ${fileName}`);
      return cached;
    }
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);

  const submit = await fetch(`${UNSILOED_BASE_URL}/parse`, {
    method: "POST",
    headers: { "api-key": apiKey },
    body: form,
  });
  const submitBody = await submit.text();
  if (!submit.ok) {
    throw new Error(`Unsiloed submit failed for ${fileName}: ${submit.status} ${submitBody}`);
  }

  const jobId = (JSON.parse(submitBody) as { job_id?: string }).job_id;
  if (!jobId) throw new Error(`Unsiloed did not return a job_id for ${fileName}`);
  console.log(`[unsiloed] submitted ${fileName}: ${jobId}`);

  let result: UnsiloedParseResult | undefined;
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 1) await Bun.sleep(POLL_INTERVAL_MS);
    const poll = await fetch(`${UNSILOED_BASE_URL}/parse/${jobId}`, {
      headers: { "api-key": apiKey },
    });
    const pollBody = await poll.text();
    if (!poll.ok) {
      throw new Error(`Unsiloed poll failed for ${fileName}: ${poll.status} ${pollBody}`);
    }
    result = JSON.parse(pollBody) as UnsiloedParseResult;
    console.log(`[unsiloed] ${fileName}: ${result.status}`);
    if (result.status === "Succeeded") break;
    if (result.status === "Failed") {
      throw new Error(`Unsiloed parse failed for ${fileName}: ${result.message ?? "unknown"}`);
    }
  }

  if (!result || result.status !== "Succeeded") {
    throw new Error(`Unsiloed parse timed out for ${fileName}`);
  }

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(result, null, 2));
  console.log(
    `[unsiloed] parsed ${fileName}: ${result.page_count ?? "?"} page(s), ${result.total_chunks} chunk(s)`,
  );
  return result;
}

async function syncIndex(
  client: MossClient,
  indexName: string,
  documents: DocumentInfo[],
): Promise<void> {
  const existing = (await client.listIndexes()).find((index) => index.name === indexName);
  if (!existing) {
    console.log(`[moss] creating ${indexName} with ${documents.length} document(s)`);
    await client.createIndex(indexName, documents, {
      modelId: "moss-minilm",
      onProgress: ({ status, progress, currentPhase }) => {
        console.log(`[moss] ${status} ${progress}%${currentPhase ? ` (${currentPhase})` : ""}`);
      },
    });
    return;
  }

  const currentDocuments = await client.getDocs(indexName);
  const currentById = new Map(currentDocuments.map((document) => [document.id, document]));
  const desiredIds = new Set(documents.map((document) => document.id));
  const changed = documents.filter((document) => {
    const current = currentById.get(document.id);
    return !current || !sameDocument(current, document);
  });
  const staleIds = currentDocuments
    .filter((document) => !desiredIds.has(document.id))
    .map((document) => document.id);

  if (changed.length > 0) {
    console.log(`[moss] upserting ${changed.length} changed document(s) into ${indexName}`);
    await client.addDocs(indexName, changed, { upsert: true });
  }
  if (staleIds.length > 0) {
    console.log(`[moss] removing ${staleIds.length} stale document(s) from ${indexName}`);
    await client.deleteDocs(indexName, staleIds);
  }
  if (changed.length === 0 && staleIds.length === 0) {
    console.log(`[moss] ${indexName} is already current (${existing.docCount} docs)`);
  }
}

async function verifyIndex(
  client: MossClient,
  indexName: string,
  documents: DocumentInfo[],
  queryOverride?: string,
): Promise<void> {
  await mkdir(MOSS_CACHE_DIR, { recursive: true });
  console.log(`[moss] loading ${indexName} for local retrieval`);
  await client.loadIndex(indexName, { cachePath: MOSS_CACHE_DIR });

  const query = queryOverride?.trim() || verificationQuery(documents);
  const result = await client.query(indexName, query, { topK: 3 });
  const cited = result.docs.find(
    (document) => document.metadata?.sourceFile && document.metadata?.page,
  );
  if (!cited) {
    throw new Error("Moss verification query returned no result with sourceFile + page metadata");
  }

  console.log(`[verify] query: ${query}`);
  console.log(
    `[verify] top hit: ${cited.metadata?.sourceFile} p.${cited.metadata?.page} score=${cited.score.toFixed(3)}`,
  );
  console.log(`[verify] ${cited.text.replace(/\s+/g, " ").slice(0, 240)}`);
}

async function main(): Promise<void> {
  const pdfs = findPdfs();
  const indexName = argument("index") || process.env.MOSS_INDEX?.trim() || DEFAULT_INDEX;
  const useCache = !process.argv.includes("--no-cache");
  const dryRun = process.argv.includes("--dry-run");

  console.log(`[ingest] data dir: ${DATA_DIR}`);
  console.log(`[ingest] found ${pdfs.length} PDF(s)`);
  for (const file of pdfs) console.log(`  - ${file}`);

  if (pdfs.length === 0) {
    throw new Error("No PDFs found. Drop the corpus into /data and re-run.");
  }

  const unsiloedApiKey = requireEnv("UNSILOED_API_KEY");
  const documents: DocumentInfo[] = [];
  for (const fileName of pdfs) {
    const parsed = await parsePdf(fileName, unsiloedApiKey, useCache);
    const fileDocuments = toMossDocuments(parsed, fileName);
    if (fileDocuments.length === 0) {
      throw new Error(`Unsiloed returned no indexable page content for ${fileName}`);
    }
    documents.push(...fileDocuments);
    console.log(`[chunk] ${fileName}: ${fileDocuments.length} Moss document(s)`);
  }

  console.log(`[chunk] total: ${documents.length} document(s) with page citations`);
  if (dryRun) {
    console.log("[ingest] dry run complete; Moss was not changed");
    return;
  }

  const client = new MossClient(requireEnv("MOSS_PROJECT_ID"), requireEnv("MOSS_PROJECT_KEY"));
  await syncIndex(client, indexName, documents);
  await verifyIndex(client, indexName, documents, argument("query"));
  console.log(`[ingest] complete: ${indexName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

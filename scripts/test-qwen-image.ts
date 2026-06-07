import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateQwenImage } from "../src/lib/qwen-image";

const OUTPUT_DIR = join(import.meta.dirname, "..", "data", ".qwen-test");
const DEFAULT_PROMPT =
  "Clean executive infographic chart on a white background showing annual revenue: " +
  "2023 $120M, 2024 $150M, 2025 $210M. Three vertical navy bars, restrained emerald " +
  "accent, large readable labels, clear title Revenue Growth, no logos, no people, " +
  "presentation-ready, crisp flat vector design.";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const prompt = argument("prompt") || DEFAULT_PROMPT;
const outputName = argument("output") || `qwen-${Date.now()}.png`;
if (!/^[a-z0-9][a-z0-9._-]*\.png$/i.test(outputName)) {
  throw new Error("--output must be a PNG filename without directory components");
}

console.log("[qwen] generating with z-image-turbo");
const result = await generateQwenImage({ prompt, size: "1024*1024", promptExtend: false });
await mkdir(OUTPUT_DIR, { recursive: true });
const outputPath = join(OUTPUT_DIR, outputName);
await writeFile(outputPath, result.bytes);
console.log(
  `[qwen] saved ${result.width}x${result.height} PNG (${result.bytes.length} bytes): ${outputPath}`,
);

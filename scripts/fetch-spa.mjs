#!/usr/bin/env node
/**
 * End-to-end test: fetch Fanatico release page and save markdown to file.
 * Run: pnpm build && node scripts/fetch-fanatico.mjs
 */
import { HybridEngine } from "../dist/index.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const FANATICO_URL = "https://store.fanatico.au/release/4651760/romar-harmonie-ephemere-ep";
const OUTPUT_FILE = join(process.cwd(), "eval-output", "fanatico-release.md");

async function main() {
  const engine = new HybridEngine({ markdown: true });
  const result = await engine.fetchHTML(FANATICO_URL, { markdown: true });
  await engine.cleanup();

  mkdirSync(join(process.cwd(), "eval-output"), { recursive: true });
  writeFileSync(OUTPUT_FILE, result.content, "utf-8");
  console.log(`Saved ${result.content.length} chars to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

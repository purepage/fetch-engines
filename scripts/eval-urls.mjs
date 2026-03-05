#!/usr/bin/env node
/**
 * Fetch URLs, convert to Markdown, save to eval-output/*.md for inspection.
 * Uses HybridEngine with markdown: true (post-migration Kreuzberg converter).
 */
import { HybridEngine } from "../dist/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const URLS = [
  "https://theguardian.com/",
  "https://openai.com/",
  "https://github.com/",
  "https://siquick.com/blog/fine-tuning-open-source-llm-doric",
  "https://www.dva.gov.au/access-benefits/payment-rates/summary-of-vea-pension-rates-limits-and-allowances",
];

function slug(url) {
  const u = new URL(url);
  const host = u.host.replace(/^www\./, "").replace(/\./g, "-");
  const pathname = u.pathname.replace(/^\//, "").replace(/\//g, "-") || "index";
  return `${host}-${pathname}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}

async function main() {
  await fs.mkdir("eval-output", { recursive: true });
  const engine = new HybridEngine({ markdown: true });

  try {
    for (const url of URLS) {
      console.log(`Fetching: ${url}`);
      try {
        const result = await engine.fetchHTML(url, { markdown: true });
        const filename = `${slug(url)}.md`;
        const outPath = path.join("eval-output", filename);
        await fs.writeFile(outPath, result.content, "utf8");
        console.log(`  -> ${outPath} (${result.content.length} chars)`);
      } catch (err) {
        console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    await engine.cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

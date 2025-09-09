// Simple script to fetch two URLs via HybridEngine and write Markdown to files
// Uses the built dist bundle to avoid requiring a TypeScript build step.

import { HybridEngine } from "../dist/index.js";
import fs from "node:fs/promises";
import path from "node:path";

// URLs to fetch
const urls = [
  "https://news.ycombinator.com/item?id=45169624",
  "https://openai.com/api/pricing/",
  "https://www.essentialenergy.com.au/careers/powerline-worker-apprenticeship",
  "https://www.dva.gov.au/access-benefits/pensions-and-payments/pension-bonus-scheme/pension-bonus-estimator",
  "https://en.wikipedia.org/wiki/2024_AFL_season",
];

// Map a URL to an output markdown filepath under scripts/output/<host>/<path>.md
function outputPathForUrl(rawUrl) {
  const u = new URL(rawUrl);
  const host = u.host; // includes subdomain
  // Normalize pathname
  let pathname = u.pathname;
  if (!pathname || pathname === "/") pathname = "/index";
  // Drop trailing slash
  if (pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  // Ensure safe file segments; keep URL structure as folders
  const safeSegments = pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]+/g, "-"));
  const dir = path.join("scripts", "output", host, ...safeSegments.slice(0, -1));
  const base = safeSegments.length ? safeSegments[safeSegments.length - 1] : "index";
  return path.join(dir, `${base}.md`);
}

async function writeFileEnsuringDir(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function run() {
  const engine = new HybridEngine({ markdown: true });
  try {
    for (const url of urls) {
      console.log(`Fetching (markdown): ${url}`);
      try {
        const result = await engine.fetchHTML(url, { markdown: true });
        const outPath = outputPathForUrl(result.url);
        await writeFileEnsuringDir(outPath, result.content);
        console.log(`Wrote: ${outPath} (type=${result.contentType}, status=${result.statusCode})`);
      } catch (err) {
        console.error(`Failed: ${url}`, err);
      }
    }
  } finally {
    await engine.cleanup();
  }
}

run().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});

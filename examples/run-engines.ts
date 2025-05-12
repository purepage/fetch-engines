import { FetchEngine, PlaywrightEngine, HybridEngine } from "../src";
import type { IEngine } from "../src"; // Import IEngine for type safety

// --- Configuration ---
const urlsToFetch = [
  "http://example.com", // Good for FetchEngine
  "https://quotes.toscrape.com/js/", // Requires JS rendering (Good for PlaywrightEngine)
  "https://www.openai.com", // Good for HybridEngine
  "https://www.juno.co.uk", // Good for HybridEngine as strong Cloudflare protection
];

// --- Helper Function ---
async function runEngine(
  engineName: string,
  engineInstance: IEngine, // Use IEngine interface for broader compatibility
  urls: string[]
) {
  console.log(`\n--- Running ${engineName} ---`);
  for (const url of urls) {
    console.log(`[${engineName}] Fetching: ${url}`);
    try {
      // Pass markdown: true directly in the call for this example
      // Note: For FetchEngine, this won't override constructor config.
      // For HybridEngine, it only applies if fallback to Playwright occurs.
      const result = await engineInstance.fetchHTML(url);
      console.log(`[${engineName}] SUCCESS: ${result.url} - Title: ${result.title}`);
      console.log(`[${engineName}] Content Type: ${result.contentType}`);
      console.log(`[${engineName}] Content (Markdown):\n${result.content.substring(0, 500)}...`);
    } catch (error: any) {
      console.error(`[${engineName}] FAILED: ${url} - Full Error:`, error);
    }
  }
  console.log(`[${engineName}] Cleaning up...`);
  await engineInstance.cleanup();
  console.log(`[${engineName}] Cleanup complete.`);
}

// --- Main Execution ---
async function main() {
  console.log("Starting Fetch Engine examples...");

  // FetchEngine example (will ignore per-request markdown option)
  const fetchEngine = new FetchEngine({ markdown: true }); // Configured for HTML
  await runEngine("FetchEngine", fetchEngine, urlsToFetch);

  // PlaywrightEngine example (will use per-request markdown option)
  const playwrightEngine = new PlaywrightEngine({ markdown: true }); // Configured for HTML
  await runEngine("PlaywrightEngine", playwrightEngine, urlsToFetch);

  // HybridEngine example (will use per-request markdown option ONLY on fallback)
  const hybridEngine = new HybridEngine({ markdown: true }); // Configured for HTML
  await runEngine("HybridEngine", hybridEngine, urlsToFetch);

  console.log("\n--- All Engines Complete ---");
}

main()
  .catch((err) => {
    console.error("Unhandled error during example execution:", err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

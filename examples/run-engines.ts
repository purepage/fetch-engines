import { FetchEngine, PlaywrightEngine, HybridEngine } from "../src";
import type { IEngine } from "../src"; // Import IEngine for type safety

// --- Configuration ---
const urlsToFetch = [
  "http://example.com", // Good for FetchEngine
  "https://quotes.toscrape.com/js/", // Requires JS rendering (Good for PlaywrightEngine)
  "https://www.openai.com", // Good for HybridEngine
];

const playwrightConfig = {
  concurrentPages: 2,
  maxRetries: 1, // Lower retries for example brevity
  useHttpFallback: true,
  poolBlockedResourceTypes: ["image", "font"], // Example config
};

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
      const result = await engineInstance.fetchHTML(url);
      console.log(`[${engineName}] SUCCESS: ${result.url} - Title: ${result.title}`);
    } catch (error: any) {
      // Log the full error object for inspection
      console.error(`[${engineName}] FAILED: ${url} - Full Error:`, error);
    }
  }
  // Ensure cleanup is called, especially for PlaywrightEngine
  console.log(`[${engineName}] Cleaning up...`);
  await engineInstance.cleanup();
  console.log(`[${engineName}] Cleanup complete.`);
}

// --- Main Execution ---
async function main() {
  console.log("Starting Fetch Engine examples...");

  const fetchEngine = new FetchEngine();
  await runEngine("FetchEngine", fetchEngine, urlsToFetch);

  const playwrightEngine = new PlaywrightEngine(playwrightConfig);
  await runEngine("PlaywrightEngine", playwrightEngine, urlsToFetch);

  const hybridEngine = new HybridEngine(playwrightConfig); // Instantiate HybridEngine
  await runEngine("HybridEngine", hybridEngine, urlsToFetch); // Run HybridEngine

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

import { HybridEngine } from "../src/index.js";

/**
 * Smart Web Scraping with HybridEngine
 *
 * Handles everything: Static sites, JavaScript-heavy SPAs, modern web apps
 * Automatically chooses the best approach for each site
 */

async function main() {
  const engine = new HybridEngine({ markdown: true });

  try {
    console.log("🌐 Scraping a modern web app...");

    // This will automatically handle JavaScript rendering if needed
    const result = await engine.fetchHTML("https://quotes.toscrape.com");

    console.log(`Found: ${result.title}`);
    console.log(`Content preview:\n${result.content.substring(0, 500)}...`);
  } finally {
    // Always cleanup browser resources
    await engine.cleanup();
  }
}

main().catch(console.error);

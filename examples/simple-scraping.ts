import { FetchEngine } from "../src/index.js";

/**
 * Simple Web Scraping with FetchEngine
 *
 * Perfect for: Blog posts, news articles, simple websites, APIs
 * Fast and lightweight - no browser needed!
 */

async function main() {
  // Get a news article as clean markdown
  const engine = new FetchEngine({ markdown: true });

  console.log("📰 Fetching news article as markdown...");
  const article = await engine.fetchHTML("https://example.com/article");

  console.log(`Title: ${article.title}`);
  console.log(`Content:\n${article.content}`);
}

main().catch(console.error);

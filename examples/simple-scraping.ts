import { FetchEngine } from "../src/index.js";

/**
 * Simple Web Scraping with FetchEngine
 *
 * Perfect for: Blog posts, news articles, simple websites, APIs
 * Fast and lightweight - no browser needed!
 */

async function main() {
  const engine = new FetchEngine();

  // Get a news article as clean markdown
  const markdownEngine = new FetchEngine({ markdown: true });

  console.log("📰 Fetching news article as markdown...");
  const article = await markdownEngine.fetchHTML("https://example.com/article");

  console.log(`Title: ${article.title}`);
  console.log(`Content:\n${article.content}`);
}

main().catch(console.error);

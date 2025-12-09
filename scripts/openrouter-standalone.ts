#!/usr/bin/env ts-node --esm
/**
 * Minimal OpenRouter repro, mirroring examples/ai-extraction.ts style.
 * Runs against local source so no package resolution tricks are needed.
 */

import { config } from "dotenv";
import { fetchStructuredContent } from "../dist/index.js";
import { z } from "zod";

// Load environment variables from .env file
config();

const schema = z.object({
  title: z.string().describe("The product title or name"),
  price: z
    .number()
    .describe("The product price as a numeric value (without currency symbols, e.g., 28.00 not '$28.00')"),
  description: z.string().describe("A detailed description of the product"),
});

async function runTest() {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY (or OPENROUTER_API_KEY) is required");
    console.error("   Set it with: export OPENAI_API_KEY=your-key-here");
    process.exit(1);
  }

  const apiConfig = {
    apiKey, // pulled from .env
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Purepage",
    },
  };

  try {
    const result = await fetchStructuredContent(
      "https://vinylunderground.co.uk/products/jeroboam-night-away-dive-into-darkness",
      schema,
      {
        model: "openai/gpt-4o-mini",
        apiConfig,
      }
    );
    console.log("✅ Success! Extracted data:", JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error("❌ Error occurred:");
    console.error(`   Message: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\n📚 Stack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

runTest();

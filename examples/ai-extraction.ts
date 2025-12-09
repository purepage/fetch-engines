import { fetchStructuredContent } from "../dist/index.js";
import { z } from "zod";
import { config } from "dotenv";
config();
// You'll need to set OPENAI_API_KEY in your environment variables

/**
 * AI-Powered Data Extraction
 *
 * Extract structured data from any webpage using AI
 * Just describe what you want and get clean JSON back
 */

// Define what data you want to extract
// IMPORTANT: All fields must have .describe() calls to guide the AI model
const productSchema = z.object({
  title: z.string().describe("The product title or name"),
  price: z
    .number()
    .describe("The product price as a numeric value (without currency symbols, e.g., 28.00 not '$28.00')"),
  description: z.string().describe("A detailed description of the product"),
});

async function main() {
  // Check if API key is set
  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ Please set OPENAI_API_KEY environment variable");
    console.log("💡 Get your key from: https://platform.openai.com/api-keys");
    return;
  }

  console.log("🤖 Extracting recipe data with AI...");

  try {
    const result = await fetchStructuredContent(
      "https://vinylunderground.co.uk/products/jeroboam-night-away-dive-into-darkness",
      productSchema,
      {
        model: "moonshotai/kimi-k2-0905",
        customPrompt: "Extract the title, price and description of the product",
        // Optional: Use OpenRouter or other OpenAI-compatible APIs
        apiConfig: {
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: "https://openrouter.ai/api/v1",
          headers: {
            "HTTP-Referer": "https://your-app.com",
            "X-Title": "Your App Name",
          },
        },
      }
    );

    console.log("✅ Recipe extracted!");
    console.log(`📄 ${result.data.title}`);
    console.log(`💰 Price: ${result.data.price}`);
    console.log(`� Description: ${result.data.description}`);
  } catch (error) {
    console.error("❌ Extraction failed:", error);
  }
}

main().catch(console.error);

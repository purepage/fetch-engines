import { fetchStructuredContent } from "../src/index.js";
import { z } from "zod";

/**
 * AI-Powered Data Extraction
 *
 * Extract structured data from any webpage using AI
 * Just describe what you want and get clean JSON back
 */

// Define what data you want to extract
const recipeSchema = z.object({
  title: z.string(),
  cookingTime: z.string(),
  servings: z.number(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()),
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
    const result = await fetchStructuredContent("https://example.com/lasagna-recipe", recipeSchema, {
      model: "gpt-4.1-mini",
      customPrompt: "Extract complete recipe information",
      // Optional: Use OpenRouter or other OpenAI-compatible APIs
      // apiConfig: {
      //   apiKey: process.env.OPENROUTER_API_KEY,
      //   baseURL: "https://openrouter.ai/api/v1",
      //   headers: {
      //     "HTTP-Referer": "https://your-app.com",
      //     "X-Title": "Your App Name",
      //   },
      // },
    });

    console.log("✅ Recipe extracted!");
    console.log(`📄 ${result.data.title}`);
    console.log(`⏱️ Cooking time: ${result.data.cookingTime}`);
    console.log(`👥 Serves: ${result.data.servings}`);
    console.log(`🥕 Ingredients: ${result.data.ingredients.length} items`);
    console.log(`📝 Steps: ${result.data.instructions.length} instructions`);
  } catch (error) {
    console.error("❌ Extraction failed:", error);
  }
}

main().catch(console.error);

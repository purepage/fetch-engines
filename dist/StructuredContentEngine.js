import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { HybridEngine } from "./HybridEngine.js";
/**
 * Engine for fetching web content and extracting structured data using AI
 */
export class StructuredContentEngine {
    hybridEngine;
    constructor(config = {}) {
        // Always enable markdown conversion for structured content
        this.hybridEngine = new HybridEngine({
            ...config,
            markdown: true,
        });
    }
    /**
     * Fetches content from a URL and extracts structured data using AI
     *
     * @param url The URL to fetch content from
     * @param schema Zod schema defining the structure of data to extract
     * @param options Additional options for the extraction process
     * @returns Promise resolving to structured data and metadata
     * @throws Error if API key is not set or if extraction fails
     */
    async fetchStructuredContent(url, schema, options) {
        const { model, customPrompt = "", engineConfig = {}, apiConfig = {} } = options;
        const apiKey = apiConfig.apiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("API key is required for structured content extraction. Provide it via apiConfig.apiKey or set OPENAI_API_KEY environment variable");
        }
        const result = await this.hybridEngine.fetchHTML(url, {
            markdown: true,
            ...engineConfig,
        });
        if (result.contentType !== "markdown") {
            throw new Error("Failed to convert content to markdown");
        }
        const systemPrompt = `You are an expert at extracting structured data from web content. 
Extract the requested information from the provided markdown content accurately and completely.
${customPrompt ? `\nAdditional context: ${customPrompt}` : ""}

Content to analyze:
${result.content}`;
        const modelConfig = this.getModelConfig(model);
        const openai = createOpenAI({
            apiKey,
            ...(apiConfig.baseURL && { baseURL: apiConfig.baseURL }),
            ...(apiConfig.headers && { headers: apiConfig.headers }),
        });
        try {
            const aiResult = await generateObject({
                model: openai(model),
                schema,
                prompt: systemPrompt,
                ...modelConfig,
            });
            return {
                data: aiResult.object,
                markdown: result.content,
                url: result.url,
                title: result.title,
                usage: {
                    promptTokens: aiResult.usage?.inputTokens ?? 0,
                    completionTokens: aiResult.usage?.outputTokens ?? 0,
                    totalTokens: aiResult.usage?.totalTokens ?? 0,
                },
            };
        }
        catch (error) {
            throw new Error(`Failed to extract structured data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Get model-specific configuration options
     */
    getModelConfig(model) {
        if (model.startsWith("gpt-5")) {
            return {
                providerOptions: {
                    openai: {
                        reasoning_effort: "low",
                    },
                },
            };
        }
        else if (model.startsWith("gpt-4.1")) {
            return {
                temperature: 0,
            };
        }
        return {};
    }
    /**
     * Clean up resources
     */
    async cleanup() {
        await this.hybridEngine.cleanup();
    }
}
/**
 * Convenience function for one-off structured content extraction
 *
 * @param url The URL to fetch content from
 * @param schema Zod schema defining the structure of data to extract
 * @param options Additional options for the extraction process
 * @returns Promise resolving to structured data and metadata
 */
export async function fetchStructuredContent(url, schema, options) {
    const engine = new StructuredContentEngine(options.engineConfig);
    try {
        return await engine.fetchStructuredContent(url, schema, options);
    }
    finally {
        await engine.cleanup();
    }
}
//# sourceMappingURL=StructuredContentEngine.js.map
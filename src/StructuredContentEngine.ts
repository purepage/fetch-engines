import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { z } from "zod";
import { HybridEngine } from "./HybridEngine.js";
import type { PlaywrightEngineConfig } from "./types.js";

/**
 * Configuration for OpenAI-compatible API providers
 */
export interface ApiConfig {
  /** API key for the provider. Defaults to OPENAI_API_KEY environment variable */
  apiKey?: string;
  /** Base URL for the API. Use this for OpenAI-compatible APIs like OpenRouter */
  baseURL?: string;
  /** Custom headers to include in API requests */
  headers?: Record<string, string>;
}

/**
 * Configuration options for structured content fetching
 */
export interface StructuredContentOptions {
  /** Model to use. Can be any model name supported by your API provider (e.g., 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', or OpenRouter model names) */
  model?: string;
  /** Custom prompt to provide additional context to the LLM */
  customPrompt?: string;
  /** HybridEngine configuration for content fetching */
  engineConfig?: PlaywrightEngineConfig;
  /** API configuration for OpenAI-compatible providers (OpenRouter, etc.) */
  apiConfig?: ApiConfig;
}

/**
 * Result of structured content extraction
 */
export interface StructuredContentResult<T> {
  /** The structured data extracted from the content */
  data: T;
  /** The original markdown content that was processed */
  markdown: string;
  /** The URL that was processed */
  url: string;
  /** The title of the page if available */
  title: string | null;
  /** Token usage information */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Engine for fetching web content and extracting structured data using AI
 */
export class StructuredContentEngine {
  private hybridEngine: HybridEngine;

  constructor(config: PlaywrightEngineConfig = {}) {
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
  async fetchStructuredContent<T>(
    url: string,
    schema: z.ZodSchema<T>,
    options: StructuredContentOptions = {}
  ): Promise<StructuredContentResult<T>> {
    const { model = "gpt-5-mini", customPrompt = "", engineConfig = {}, apiConfig = {} } = options;

    // Determine API key - use apiConfig.apiKey if provided, otherwise fall back to OPENAI_API_KEY env var
    const apiKey = apiConfig.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "API key is required for structured content extraction. Provide it via apiConfig.apiKey or set OPENAI_API_KEY environment variable"
      );
    }

    // Fetch content using HybridEngine with markdown enabled
    const result = await this.hybridEngine.fetchHTML(url, {
      markdown: true,
      ...engineConfig,
    });

    if (result.contentType !== "markdown") {
      throw new Error("Failed to convert content to markdown");
    }

    // Prepare the prompt for the LLM
    const systemPrompt = `You are an expert at extracting structured data from web content. 
Extract the requested information from the provided markdown content accurately and completely.
${customPrompt ? `\nAdditional context: ${customPrompt}` : ""}

Content to analyze:
${result.content}`;

    // Configure model-specific options
    const modelConfig = this.getModelConfig(model);

    // Configure OpenAI-compatible API provider
    const openaiConfig: {
      apiKey: string;
      baseURL?: string;
      headers?: Record<string, string>;
    } = {
      apiKey,
    };

    if (apiConfig.baseURL) {
      openaiConfig.baseURL = apiConfig.baseURL;
    }

    if (apiConfig.headers) {
      openaiConfig.headers = apiConfig.headers;
    }

    // Create OpenAI provider instance with custom configuration
    const openai = createOpenAI(openaiConfig);

    try {
      // Generate structured object using AI SDK
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
          promptTokens: (aiResult.usage as any)?.promptTokens ?? 0,
          completionTokens: (aiResult.usage as any)?.completionTokens ?? 0,
          totalTokens: (aiResult.usage as any)?.totalTokens ?? 0,
        },
      };
    } catch (error) {
      throw new Error(`Failed to extract structured data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get model-specific configuration options
   */
  private getModelConfig(model: string) {
    if (model.startsWith("gpt-5")) {
      return {
        providerOptions: {
          openai: {
            reasoning_effort: "low",
          },
        },
      };
    } else if (model.startsWith("gpt-4.1")) {
      return {
        temperature: 0,
      };
    }
    return {};
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
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
export async function fetchStructuredContent<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options: StructuredContentOptions = {}
): Promise<StructuredContentResult<T>> {
  const engine = new StructuredContentEngine(options.engineConfig);
  try {
    return await engine.fetchStructuredContent(url, schema, options);
  } finally {
    await engine.cleanup();
  }
}

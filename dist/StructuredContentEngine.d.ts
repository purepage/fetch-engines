import type { z } from "zod";
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
export declare class StructuredContentEngine {
    private hybridEngine;
    constructor(config?: PlaywrightEngineConfig);
    /**
     * Fetches content from a URL and extracts structured data using AI
     *
     * @param url The URL to fetch content from
     * @param schema Zod schema defining the structure of data to extract
     * @param options Additional options for the extraction process
     * @returns Promise resolving to structured data and metadata
     * @throws Error if API key is not set or if extraction fails
     */
    fetchStructuredContent<T>(url: string, schema: z.ZodSchema<T>, options?: StructuredContentOptions): Promise<StructuredContentResult<T>>;
    /**
     * Get model-specific configuration options
     */
    private getModelConfig;
    /**
     * Clean up resources
     */
    cleanup(): Promise<void>;
}
/**
 * Convenience function for one-off structured content extraction
 *
 * @param url The URL to fetch content from
 * @param schema Zod schema defining the structure of data to extract
 * @param options Additional options for the extraction process
 * @returns Promise resolving to structured data and metadata
 */
export declare function fetchStructuredContent<T>(url: string, schema: z.ZodSchema<T>, options?: StructuredContentOptions): Promise<StructuredContentResult<T>>;
//# sourceMappingURL=StructuredContentEngine.d.ts.map
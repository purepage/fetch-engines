import type { z } from "zod";
import type { PlaywrightEngineConfig } from "./types.js";
/**
 * Configuration options for structured content fetching
 */
export interface StructuredContentOptions {
    /** OpenAI model to use. Options: 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5', 'gpt-5-mini' */
    model?: "gpt-4.1-mini" | "gpt-4.1" | "gpt-5" | "gpt-5-mini";
    /** Custom prompt to provide additional context to the LLM */
    customPrompt?: string;
    /** HybridEngine configuration for content fetching */
    engineConfig?: PlaywrightEngineConfig;
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
     * @throws Error if OPENAI_API_KEY is not set or if extraction fails
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
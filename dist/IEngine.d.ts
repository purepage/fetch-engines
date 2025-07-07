import type { HTMLFetchResult, ContentFetchResult, ContentFetchOptions, BrowserMetrics } from "./types.js";
/**
 * Interface for browser engines that can fetch HTML content from URLs
 */
export interface IEngine {
    /**
     * Fetches HTML content from a URL
     * @param url The URL to fetch
     * @returns A promise that resolves to an HTMLFetchResult
     */
    fetchHTML(url: string): Promise<HTMLFetchResult>;
    /**
     * Fetches raw content from a URL (mimics standard fetch API)
     * @param url The URL to fetch
     * @param options Optional fetch options
     * @returns A promise that resolves to a ContentFetchResult
     */
    fetchContent(url: string, options?: ContentFetchOptions): Promise<ContentFetchResult>;
    /**
     * Cleans up resources used by the engine
     */
    cleanup(): Promise<void>;
    /**
     * Gets metrics about the engine's performance
     * @returns An array of BrowserMetrics
     */
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=IEngine.d.ts.map
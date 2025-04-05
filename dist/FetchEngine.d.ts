import type { HTMLFetchResult, BrowserMetrics } from "./types.js";
import type { IEngine } from "./IEngine.js";
/**
 * Custom error class for HTTP errors from FetchEngine.
 */
export declare class FetchEngineHttpError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode: number);
}
/**
 * FetchEngine - A lightweight engine for fetching HTML content using the standard `fetch` API.
 *
 * Ideal for fetching content from static websites or APIs where JavaScript execution is not required.
 * It does not support advanced configurations like retries, caching, or proxies directly.
 */
export declare class FetchEngine implements IEngine {
    private readonly headers;
    /**
     * Creates an instance of FetchEngine.
     * Note: This engine currently does not accept configuration options.
     */
    constructor();
    /**
     * Fetches HTML content from the specified URL using the `fetch` API.
     *
     * @param url The URL to fetch.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
     * @throws {Error} If the content type is not HTML or for other network errors.
     */
    fetchHTML(url: string): Promise<HTMLFetchResult>;
    private detectSPA;
    /**
     * Cleans up resources used by the engine.
     * For FetchEngine, this is a no-op as it doesn't manage persistent resources.
     * @returns A Promise that resolves when cleanup is complete.
     */
    cleanup(): Promise<void>;
    /**
     * Retrieves metrics for the engine.
     * FetchEngine does not manage browsers, so it returns an empty array.
     * @returns An empty array.
     */
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=FetchEngine.d.ts.map
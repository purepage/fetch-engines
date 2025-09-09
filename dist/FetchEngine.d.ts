import type { HTMLFetchResult, ContentFetchResult, ContentFetchOptions, BrowserMetrics, FetchEngineOptions, PostOptions } from "./types.js";
import type { IEngine } from "./IEngine.js";
import { FetchError } from "./errors.js";
/**
 * Custom error class for HTTP errors from FetchEngine.
 */
export declare class FetchEngineHttpError extends FetchError {
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
    private readonly options;
    private static readonly DEFAULT_OPTIONS;
    /**
     * Creates an instance of FetchEngine.
     * @param options Configuration options for the FetchEngine.
     */
    constructor(options?: FetchEngineOptions);
    /**
     * Fetches HTML or converts to Markdown from the specified URL.
     *
     * @param url The URL to fetch.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
     * @throws {Error} If the content type is not HTML or for other network errors.
     */
    fetchHTML(url: string, options?: FetchEngineOptions): Promise<HTMLFetchResult>;
    /**
     * Fetches raw content from the specified URL (mimics standard fetch API).
     *
     * @param url The URL to fetch.
     * @param options Optional fetch options.
     * @returns A Promise resolving to a ContentFetchResult object.
     * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
     * @throws {Error} For network errors or other fetch failures.
     */
    fetchContent(url: string, options?: ContentFetchOptions): Promise<ContentFetchResult>;
    /**
     * Performs a POST request expecting HTML in response.
     *
     * @param url The URL to send the POST request to.
     * @param body The body to send.
     * @param options Optional post options including headers and markdown.
     */
    postHTML(url: string, body: string | URLSearchParams | FormData, options?: PostOptions): Promise<HTMLFetchResult>;
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
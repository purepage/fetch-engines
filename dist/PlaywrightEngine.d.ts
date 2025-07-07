import type { HTMLFetchResult, ContentFetchResult, ContentFetchOptions, BrowserMetrics, PlaywrightEngineConfig, FetchOptions } from "./types.js";
import type { IEngine } from "./IEngine.js";
/**
 * PlaywrightEngine - Fetches HTML using a managed pool of headless Playwright browser instances.
 *
 * This engine is suitable for dynamic websites that require JavaScript execution.
 * It incorporates `playwright-extra` with the stealth plugin for enhanced anti-detection capabilities.
 * Features include caching, retries, HTTP fallback, and configurable browser pooling.
 */
export declare class PlaywrightEngine implements IEngine {
    private browserPool;
    private readonly queue;
    private readonly cache;
    private readonly config;
    private initializingBrowserPool;
    private isUsingHeadedMode;
    private headedFallbackSites;
    private static readonly DEFAULT_CONFIG;
    /**
     * Creates an instance of PlaywrightEngine.
     *
     * @param config Configuration options for the engine and its browser pool.
     *               See `PlaywrightEngineConfig` for details.
     */
    constructor(config?: PlaywrightEngineConfig);
    /**
     * Initialize the browser pool with improved error handling and mode switching.
     */
    private initializeBrowserPool;
    /**
     * Fallback method using simple HTTP requests via Axios.
     * Ensures return type matches HTMLFetchResult.
     */
    private fetchHTMLWithHttpFallback;
    private checkCache;
    /**
     * Safely check if a page is still usable and connected.
     */
    private isPageValid;
    /**
     * Simulate human-like interactions on the page.
     */
    private simulateHumanBehavior;
    /**
     * Adds a result to the in-memory cache.
     */
    private addToCache;
    /**
     * Public method to fetch HTML. Delegates to the internal recursive fetch method.
     *
     * @param url The URL to fetch.
     * @param options Optional settings for this specific fetch operation.
     * @param options.fastMode Overrides the engine's `defaultFastMode` configuration for this request.
     * @param options.spaMode Overrides the engine's `spaMode` configuration for this request.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchError} If the fetch fails after all retries or encounters critical errors.
     */
    fetchHTML(url: string, options?: FetchOptions & {
        markdown?: boolean;
        spaMode?: boolean;
    }): Promise<HTMLFetchResult>;
    /**
     * Helper to check cache and potentially return a cached result.
     * Handles logic for re-fetching if cache is stale or content type mismatch for markdown.
     *
     * @param url URL to check in cache
     * @param currentConfig Current fetch configuration
     * @returns Cached result or null if not found/needs re-fetch.
     */
    private _handleCacheCheck;
    /**
     * Attempts to fetch the URL using a simple HTTP GET request as a fallback.
     *
     * @param url The URL to fetch.
     * @param currentConfig The current fetch configuration.
     * @returns A Promise resolving to an HTMLFetchResult if successful, or null if fallback is skipped or a challenge page is encountered.
     * @throws {FetchError} If the HTTP fallback itself fails with an unrecoverable error.
     */
    private _attemptHttpFallback;
    /**
     * Ensures the browser pool is initialized with the correct mode (headed/headless).
     * Handles one retry attempt if the initial pool initialization fails.
     *
     * @param useHeadedMode Whether to initialize the pool in headed mode.
     * @param currentConfig The current fetch configuration (for retryDelay).
     * @returns A Promise that resolves when the pool is initialized, or rejects if initialization fails after retries.
     * @throws {FetchError} If pool initialization fails after retries or if the pool is unavailable.
     */
    private _ensureBrowserPoolInitialized;
    /**
     * Internal recursive method to handle fetching with retries.
     *
     * @param url URL to fetch
     * @param currentConfig The merged configuration including markdown option
     * @param retryAttempt Current retry attempt number (starts at 0)
     * @returns Promise resolving to HTMLFetchResult
     */
    private _fetchRecursive;
    /**
     * Performs the actual page fetch using a Playwright page from the pool.
     * Ensures return type matches HTMLFetchResult.
     */
    private fetchWithPlaywright;
    private applyBlockingRules;
    /**
     * Cleans up resources used by the engine, primarily closing browser instances in the pool.
     *
     * It is crucial to call this method when finished with the engine instance to release resources.
     * @returns A Promise that resolves when cleanup is complete.
     */
    cleanup(): Promise<void>;
    /**
     * Retrieves metrics from the underlying browser pool.
     * @returns An array of BrowserMetrics objects, one for each active browser instance, or an empty array if the pool is not initialized.
     */
    getMetrics(): BrowserMetrics[];
    private shouldUseHeadedMode;
    /**
     * Fetches raw content from the specified URL using Playwright with HTTP fallback.
     * Mimics standard fetch API behavior.
     *
     * @param url The URL to fetch content from.
     * @param options Optional fetch options.
     * @returns A Promise resolving to a ContentFetchResult object.
     * @throws {FetchError} If the fetch operation fails after all retries.
     */
    fetchContent(url: string, options?: ContentFetchOptions): Promise<ContentFetchResult>;
    /**
     * Check cache for content fetch results.
     */
    private checkContentCache;
    /**
     * Add content fetch result to cache.
     */
    private addContentToCache;
    /**
     * Recursive fetch implementation with retry logic for content fetching.
     */
    private _fetchContentRecursive;
    /**
     * HTTP fallback for content fetching.
     */
    private _attemptContentHttpFallback;
    /**
     * Fetch content using Playwright browser.
     */
    private fetchContentWithPlaywright;
}
//# sourceMappingURL=PlaywrightEngine.d.ts.map
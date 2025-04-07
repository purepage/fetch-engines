import type { HTMLFetchResult, BrowserMetrics, PlaywrightEngineConfig, FetchOptions } from "./types.js";
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
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchError} If the fetch fails after all retries or encounters critical errors.
     */
    fetchHTML(url: string, options?: FetchOptions & {
        markdown?: boolean;
    }): Promise<HTMLFetchResult>;
    /**
     * Internal recursive method to handle fetching with retries.
     *
     * @param url URL to fetch
     * @param currentConfig The merged configuration including markdown option
     * @param retryAttempt Current retry attempt number (starts at 0)
     * @param parentRetryCount Tracks retries related to pool initialization errors (starts at 0)
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
}
//# sourceMappingURL=PlaywrightEngine.d.ts.map
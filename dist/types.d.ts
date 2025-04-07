import type { Browser as PlaywrightBrowser, BrowserContext } from "playwright";
/**
 * Defines the structure for the result of fetching HTML content.
 */
export interface HTMLFetchResult {
    /** The fetched HTML content OR the converted Markdown content. */
    content: string;
    /** Indicates the type of content in the 'content' field. */
    contentType: "html" | "markdown";
    /** The extracted title of the page, if available. */
    title: string | null;
    /** The final URL after any redirects. */
    url: string;
    /** Indicates if the result came from the cache. */
    isFromCache: boolean;
    /** The HTTP status code of the final response. */
    statusCode: number | undefined;
    /** Any error encountered during the fetch process. */
    error: Error | undefined;
}
/**
 * Metrics related to browser pool performance and status.
 */
export interface BrowserMetrics {
    id: string;
    engine?: "playwright" | string;
    pagesCreated: number;
    activePages: number;
    lastUsed: Date;
    errors: number;
    totalRequests?: number;
    avgResponseTime?: number;
    createdAt: Date;
    isHealthy: boolean;
}
/**
 * Internal representation of a Playwright browser instance within the pool.
 */
export interface BrowserInstance {
    browser: PlaywrightBrowser;
    context: BrowserContext;
    metrics: BrowserMetrics;
    isHealthy: boolean;
}
/**
 * Configuration options for the PlaywrightEngine.
 */
export interface PlaywrightEngineConfig {
    /**
     * Maximum number of Playwright pages to process concurrently.
     * @default 3
     */
    concurrentPages?: number;
    /**
     * Maximum number of retry attempts for a failed fetch operation (excluding initial attempt).
     * @default 3
     */
    maxRetries?: number;
    /**
     * Delay in milliseconds between retry attempts.
     * @default 5000
     */
    retryDelay?: number;
    /**
     * Time-to-live for cached results in milliseconds. Set to 0 to disable.
     * @default 900000 (15 minutes)
     */
    cacheTTL?: number;
    /**
     * If true, attempts a fast HTTP GET first before using Playwright.
     * @default true
     */
    useHttpFallback?: boolean;
    /**
     * If true, automatically retries failed requests for a domain in headed mode.
     * @default false
     */
    useHeadedModeFallback?: boolean;
    /**
     * If true, requests initially block non-essential resources and skip human simulation.
     * Can be overridden per-request via fetchHTML options.
     * @default true
     */
    defaultFastMode?: boolean;
    /**
     * If true (and not in fastMode), attempts basic human-like interactions.
     * @default true
     */
    simulateHumanBehavior?: boolean;
    /**
     * Maximum number of concurrent browser instances the pool manages.
     * Passed to PlaywrightBrowserPool.
     * @default 2
     */
    maxBrowsers?: number;
    /**
     * Maximum number of pages per browser context before recycling.
     * Passed to PlaywrightBrowserPool.
     * @default 6
     */
    maxPagesPerContext?: number;
    /**
     * Maximum age in ms a browser instance lives before recycling.
     * Passed to PlaywrightBrowserPool.
     * @default 1200000 (20 minutes)
     */
    maxBrowserAge?: number;
    /**
     * How often (in ms) the pool checks browser health.
     * Passed to PlaywrightBrowserPool.
     * @default 60000 (1 minute)
     */
    healthCheckInterval?: number;
    /**
     * List of domain glob patterns to block requests to. Overrides pool default.
     * Passed to PlaywrightBrowserPool.
     * @default [] (uses pool's defaults)
     */
    poolBlockedDomains?: string[];
    /**
     * List of Playwright resource types (e.g., 'image', 'font') to block. Overrides pool default.
     * Passed to PlaywrightBrowserPool.
     * @default [] (uses pool's defaults)
     */
    poolBlockedResourceTypes?: string[];
    /**
     * Proxy configuration for browser instances.
     * Passed to PlaywrightBrowserPool.
     * @default undefined
     */
    proxy?: {
        /** Proxy server URL (e.g., "http://host:port", "socks5://user:pass@host:port"). */
        server: string;
        /** Optional proxy username. */
        username?: string;
        /** Optional proxy password. */
        password?: string;
    };
    /**
     * Forces the entire pool to launch browsers in headed (visible) mode.
     * Passed to PlaywrightBrowserPool.
     * @default false
     */
    useHeadedMode?: boolean;
    /**
     * If true, the fetched HTML content will be converted to Markdown.
     * @default false
     */
    markdown?: boolean;
}
/**
 * Options that can be passed per-request to engine.fetchHTML().
 */
export interface FetchOptions {
    /** Overrides the engine's defaultFastMode for this specific request. (Playwright/Hybrid only) */
    fastMode?: boolean;
    /** Overrides the engine's markdown setting for this specific request. (Playwright/Hybrid only) */
    markdown?: boolean;
}
/**
 * Configuration options specifically for the FetchEngine.
 */
export interface FetchEngineOptions {
    /** If true, convert the fetched HTML to Markdown. Default: false */
    markdown?: boolean;
}
//# sourceMappingURL=types.d.ts.map
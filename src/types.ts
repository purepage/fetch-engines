import type { Browser as PlaywrightBrowser, BrowserContext, LaunchOptions } from "playwright";

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
  error: Error | undefined; // Use generic Error type
}

/**
 * Defines the structure for the result of fetching raw content (mimics fetch API).
 */
export interface ContentFetchResult {
  /** The fetched raw content as Buffer for binary data or string for text data. */
  content: Buffer | string;
  /** The MIME type of the content as returned by the server. */
  contentType: string;
  /** The extracted title of the page, if available and if content is HTML. */
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
  id: string; // Unique identifier for the browser instance
  engine?: "playwright" | string; // Engine type - Removed "puppeteer"
  pagesCreated: number; // Total pages ever created by this browser
  activePages: number; // Current number of open pages/tabs
  lastUsed: Date; // Timestamp of the last time a page was acquired or released from this browser
  errors: number; // Count of significant errors encountered (e.g., page creation failure)
  totalRequests?: number; // Optional: Total network requests handled (if tracked)
  avgResponseTime?: number; // Optional: Average response time for requests (if tracked)
  createdAt: Date; // Timestamp when the browser instance was created
  isHealthy: boolean; // Current health status (true = responsive, false = needs removal)
}

/**
 * Internal representation of a Playwright browser instance within the pool.
 */
export interface BrowserInstance {
  browser: PlaywrightBrowser; // Use Playwright Browser type
  context: BrowserContext; // Add Playwright BrowserContext
  metrics: BrowserMetrics;
  isHealthy: boolean; // Instance-level health status (can differ slightly from metrics.isHealthy during checks)
}

// Note: PlaywrightBrowserInstance is defined internally within PlaywrightBrowserPool.ts
// and does not need to be exported here unless required elsewhere.

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

  // --- Browser Pool Pass-through Options ---

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
  useHeadedMode?: boolean; // Added missing config option identified during README creation
  /**
   * If true, the fetched HTML content will be converted to Markdown.
   * @default false
   */
  markdown?: boolean; // Add the new markdown option

  /**
   * Enables Single Page Application (SPA) mode, which adjusts fetching strategies
   * for sites that heavily rely on client-side JavaScript rendering.
   * When true, this may override options like `useHttpFallback` and `defaultFastMode`,
   * and employ more patient page loading mechanisms.
   * @default false
   */
  spaMode?: boolean;

  /**
   * Explicit delay in milliseconds to wait after initial page load events when spaMode is true,
   * allowing more time for client-side rendering and data fetching to complete.
   * Only applies if `spaMode` is true.
   * @default 0 (no additional fixed delay beyond Playwright's own waits)
   */
  spaRenderDelayMs?: number;

  /**
   * An array of string or RegExp patterns. If a URL matches any of these patterns,
   * the HybridEngine will use PlaywrightEngine directly, bypassing FetchEngine and SPA shell heuristics.
   * @default []
   */
  playwrightOnlyPatterns?: (string | RegExp)[];

  /**
   * Optional Playwright launch options to be passed when a browser instance is created.
   * These will be merged with the pool's default launch options.
   * @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch
   * @default undefined
   */
  playwrightLaunchOptions?: LaunchOptions;
  /** Optional headers to include in the request. */
  headers?: Record<string, string>;
}

/**
 * Options that can be passed per-request to engine.fetchHTML().
 */
export interface FetchOptions {
  /** Overrides the engine's defaultFastMode for this specific request. (Playwright/Hybrid only) */
  fastMode?: boolean;
  /** Overrides the engine's markdown setting for this specific request. (Playwright/Hybrid only) */
  markdown?: boolean;
  /** Overrides the engine's spaMode setting for this specific request. (Playwright/Hybrid only) */
  spaMode?: boolean;
  /** Optional headers to include in the request. */
  headers?: Record<string, string>;
}

/**
 * Options for POST-based requests such as postHTML.
 * Use the `headers["Content-Type"]` field to specify the body type.
 */
export interface PostOptions extends FetchOptions {}

/**
 * Options that can be passed per-request to engine.fetchContent().
 * Mimics standard fetch behavior with minimal processing.
 */
export interface ContentFetchOptions {
  /** Optional headers to include in the request. */
  headers?: Record<string, string>;
  /** Overrides the engine's defaultFastMode for this specific request. (Playwright/Hybrid only) */
  fastMode?: boolean;
}

/**
 * Configuration options specifically for the FetchEngine.
 */
export interface FetchEngineOptions {
  /** If true, convert the fetched HTML to Markdown. Default: false */
  markdown?: boolean;
  /** Optional headers to include in the request. */
  headers?: Record<string, string>;
  // Add other FetchEngine-specific options here if needed
}

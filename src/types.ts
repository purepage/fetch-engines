import type { Browser as PlaywrightBrowser, BrowserContext } from "playwright";

/**
 * Result object returned by engine's fetchHTML method.
 */
export interface HTMLFetchResult {
  /** The full HTML content of the fetched page. */
  html: string;
  /** The extracted content of the <title> tag, or an empty string if not found. */
  title: string;
  /** The final URL after any redirects. */
  url: string;
  /** Indicates if the result was served from the engine's cache. */
  isFromCache: boolean; // Added based on README documentation
  /** The HTTP status code of the final response, if available. */
  statusCode?: number; // Added based on README documentation
  /** Error object if the fetch failed after all retries. */
  error?: Error; // Added based on README documentation (simplified type for now)
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
}

/**
 * Options that can be passed per-request to engine.fetchHTML().
 */
export interface FetchOptions {
  /** Overrides the engine's defaultFastMode for this specific request. */
  fastMode?: boolean;
}

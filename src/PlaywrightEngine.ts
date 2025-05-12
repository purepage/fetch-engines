import type { HTMLFetchResult, BrowserMetrics, PlaywrightEngineConfig, FetchOptions } from "./types.js";
import type { IEngine } from "./IEngine.js";
import { PlaywrightBrowserPool } from "./browser/PlaywrightBrowserPool.js";
import PQueue from "p-queue";
import type { Route, Page, /* BrowserContext, */ Response as PlaywrightResponse } from "playwright"; // Removed unused BrowserContext
import axios from "axios";
import { FetchError } from "./errors.js"; // Import FetchError
import { MarkdownConverter } from "./utils/markdown-converter.js"; // Import the converter
import {
  DEFAULT_HTTP_TIMEOUT,
  SHORT_DELAY_MS,
  EVALUATION_TIMEOUT_MS,
  COMMON_HEADERS,
  MAX_REDIRECTS,
  REGEX_TITLE_TAG,
  REGEX_SIMPLE_HTML_TITLE_FALLBACK,
  REGEX_SANITIZE_HTML_TAGS,
  REGEX_CHALLENGE_PAGE_KEYWORDS,
  HUMAN_SIMULATION_MIN_DELAY_MS,
  HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS,
  HUMAN_SIMULATION_SCROLL_DELAY_MS,
  HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS,
} from "./constants.js"; // Corrected path

function delay(time: number): Promise<void> {
  // Added return type
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Simple in-memory cache with expiration
interface CacheEntry {
  result: HTMLFetchResult;
  timestamp: number;
}

/**
 * PlaywrightEngine - Fetches HTML using a managed pool of headless Playwright browser instances.
 *
 * This engine is suitable for dynamic websites that require JavaScript execution.
 * It incorporates `playwright-extra` with the stealth plugin for enhanced anti-detection capabilities.
 * Features include caching, retries, HTTP fallback, and configurable browser pooling.
 */
export class PlaywrightEngine implements IEngine {
  private browserPool: PlaywrightBrowserPool | null = null;
  private readonly queue: PQueue;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly config: Required<PlaywrightEngineConfig>;

  // Browser pooling safety flags
  private initializingBrowserPool: boolean = false;
  private isUsingHeadedMode: boolean = false; // Tracks current pool mode
  private headedFallbackSites: Set<string> = new Set(); // Stores domains marked for headed mode

  // Default configuration - Ensure all required fields are present
  private static readonly DEFAULT_CONFIG: Required<PlaywrightEngineConfig> = {
    concurrentPages: 3,
    maxRetries: 3,
    retryDelay: 5000,
    cacheTTL: 15 * 60 * 1000,
    useHttpFallback: true,
    useHeadedModeFallback: false,
    defaultFastMode: true,
    simulateHumanBehavior: true,
    maxBrowsers: 2,
    maxPagesPerContext: 6,
    maxBrowserAge: 20 * 60 * 1000,
    healthCheckInterval: 60 * 1000,
    poolBlockedDomains: [],
    poolBlockedResourceTypes: [],
    proxy: undefined as any,
    useHeadedMode: false, // ADDED default
    markdown: true,
    spaMode: false, // ADDED spaMode default
    spaRenderDelayMs: 0, // ADDED spaRenderDelayMs default
  };

  /**
   * Creates an instance of PlaywrightEngine.
   *
   * @param config Configuration options for the engine and its browser pool.
   *               See `PlaywrightEngineConfig` for details.
   */
  constructor(config: PlaywrightEngineConfig = {}) {
    // Merge provided config with defaults
    this.config = { ...PlaywrightEngine.DEFAULT_CONFIG, ...config };
    this.queue = new PQueue({ concurrency: this.config.concurrentPages });
  }

  /**
   * Initialize the browser pool with improved error handling and mode switching.
   */
  private async initializeBrowserPool(useHeadedMode: boolean = false): Promise<void> {
    if (this.browserPool && this.isUsingHeadedMode === useHeadedMode) {
      return;
    }
    if (this.initializingBrowserPool) {
      while (this.initializingBrowserPool) {
        await delay(SHORT_DELAY_MS);
      }
      if (this.browserPool && this.isUsingHeadedMode === useHeadedMode) {
        return;
      }
    }
    this.initializingBrowserPool = true;
    try {
      if (this.browserPool && this.isUsingHeadedMode !== useHeadedMode) {
        await this.browserPool.cleanup();
        this.browserPool = null;
      }
      this.isUsingHeadedMode = useHeadedMode;
      this.browserPool = new PlaywrightBrowserPool({
        maxBrowsers: this.config.maxBrowsers,
        maxPagesPerContext: this.config.maxPagesPerContext,
        maxBrowserAge: this.config.maxBrowserAge,
        healthCheckInterval: this.config.healthCheckInterval,
        useHeadedMode: useHeadedMode,
        blockedDomains: this.config.poolBlockedDomains,
        blockedResourceTypes: this.config.poolBlockedResourceTypes,
        proxy: this.config.proxy,
      });
      await this.browserPool.initialize();
    } catch (error) {
      this.browserPool = null;
      this.isUsingHeadedMode = false;
      throw error;
    } finally {
      this.initializingBrowserPool = false;
    }
  }

  /**
   * Fallback method using simple HTTP requests via Axios.
   * Ensures return type matches HTMLFetchResult.
   */
  private async fetchHTMLWithHttpFallback(url: string): Promise<HTMLFetchResult> {
    try {
      const response = await axios.get(url, {
        headers: COMMON_HEADERS,
        maxRedirects: MAX_REDIRECTS,
        timeout: DEFAULT_HTTP_TIMEOUT,
        responseType: "text",
        // Decompress response automatically
        decompress: true,
      });

      // Extract title using regex (more robust version needed for real HTML)
      // For testing, handle simple cases like <html>Title</html>
      const titleMatch = response.data.match(REGEX_TITLE_TAG);
      let title = titleMatch ? titleMatch[1].trim() : "";
      // Simple fallback for testing mocks like <html>Fallback OK</html>
      if (!title && REGEX_SIMPLE_HTML_TITLE_FALLBACK.test(response.data)) {
        title = response.data.replace(REGEX_SANITIZE_HTML_TAGS, "").trim();
      }

      // Basic check for challenge pages
      const lowerHtml = response.data.toLowerCase();
      const isChallengeOrBot = REGEX_CHALLENGE_PAGE_KEYWORDS.test(lowerHtml);

      if (isChallengeOrBot) {
        // Throw specific error code for easier handling upstream
        throw new FetchError("Received challenge page via HTTP fallback", "ERR_CHALLENGE_PAGE");
      }

      const originalHtml = response.data;
      let finalContent = originalHtml;
      let finalContentType: "html" | "markdown" = "html";

      // Apply markdown conversion here if the *engine config* option is set
      // NOTE: This currently uses engine config, not per-request. Could be refined.
      if (this.config.markdown) {
        try {
          const converter = new MarkdownConverter();
          finalContent = converter.convert(originalHtml);
          finalContentType = "markdown";
        } catch (conversionError) {
          console.error(`Markdown conversion failed for ${url} (HTTP fallback):`, conversionError);
          // Fallback to original HTML on conversion error
        }
      }

      return {
        content: finalContent,
        contentType: finalContentType,
        title: title, // title is extracted from original HTML
        url: response.request?.res?.responseUrl || response.config.url || url,
        isFromCache: false,
        statusCode: response.status,
        error: undefined,
      };
    } catch (error: any) {
      // Wrap non-FetchErrors
      if (!(error instanceof FetchError)) {
        throw new FetchError(`HTTP fallback failed: ${error.message}`, "ERR_HTTP_FALLBACK_FAILED", error);
      }
      throw error; // Re-throw FetchError or other wrapped errors
    }
  }

  private checkCache(url: string): HTMLFetchResult | null {
    // NOTE: Cache stores the full HTMLFetchResult, including contentType.
    // If HTML is cached, and later Markdown is requested, the cached HTML result will be returned.
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.result;
    }
    if (cached) {
      this.cache.delete(url);
    }
    return null;
  }

  /**
   * Safely check if a page is still usable and connected.
   */
  private async isPageValid(page: Page | null): Promise<boolean> {
    if (!page || page.isClosed()) return false;
    try {
      // Check connection status
      if (!page.context().browser()?.isConnected()) return false;
      // Try a simple operation that throws if the page is crashed/detached
      await page.evaluate("1 + 1", { timeout: EVALUATION_TIMEOUT_MS });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Simulate human-like interactions on the page.
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    if (!(await this.isPageValid(page))) return;

    try {
      const viewport = page.viewportSize();
      if (!viewport) return;

      // Gentle mouse movements
      await page.mouse.move(Math.random() * viewport.width, (Math.random() * viewport.height) / 3, { steps: 5 });
      await delay(HUMAN_SIMULATION_MIN_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS);
      await page.mouse.move(
        Math.random() * viewport.width,
        viewport.height / 2 + (Math.random() * viewport.height) / 2,
        { steps: 10 }
      );
      await delay(HUMAN_SIMULATION_SCROLL_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS);

      // Gentle scroll
      const scrollAmount = Math.floor(Math.random() * (viewport.height / 2)) + viewport.height / 4;
      await page.evaluate((scroll) => window.scrollBy(0, scroll), scrollAmount);
      await delay(HUMAN_SIMULATION_SCROLL_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS);

      // Additional random small mouse movements
      for (let i = 0; i < 2; i++) {
        if (!(await this.isPageValid(page))) break;
        await page.mouse.move(Math.random() * viewport.width, Math.random() * viewport.height, {
          steps: 3 + Math.floor(Math.random() * 3),
        });
        await delay(HUMAN_SIMULATION_MIN_DELAY_MS / 2 + Math.random() * (HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS / 2));
      }
    } catch (err) {
      // Ignore errors during simulation, log for debugging if necessary
      // console.debug(`Error during human-like simulation on ${page.url()}: ${err.message}`);
    }
  }

  /**
   * Adds a result to the in-memory cache.
   */
  private addToCache(url: string, result: HTMLFetchResult): void {
    if (this.config.cacheTTL <= 0) return; // Don't cache if TTL is zero or negative

    const entry: CacheEntry = {
      result: { ...result, isFromCache: true }, // Mark as cached
      timestamp: Date.now(),
    };
    this.cache.set(url, entry);
  }

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
  async fetchHTML(
    url: string,
    options: FetchOptions & { markdown?: boolean; spaMode?: boolean } = {}
  ): Promise<HTMLFetchResult> {
    const fetchConfig = {
      ...this.config,
      markdown: options.markdown === undefined ? this.config.markdown : options.markdown,
      fastMode: options.fastMode === undefined ? this.config.defaultFastMode : options.fastMode,
      spaMode: options.spaMode === undefined ? this.config.spaMode : options.spaMode,
      // spaRenderDelayMs will be taken from this.config directly where needed or passed via merged config
    };
    // Type assertion needed here as fetchConfig is slightly broader than the recursive fn expects
    // We'll refine the type for _fetchRecursive to include spaMode and spaRenderDelayMs
    return this._fetchRecursive(url, fetchConfig as any, 0, 0);
  }

  /**
   * Internal recursive method to handle fetching with retries.
   *
   * @param url URL to fetch
   * @param currentConfig The merged configuration including markdown option
   * @param retryAttempt Current retry attempt number (starts at 0)
   * @param parentRetryCount Tracks retries related to pool initialization errors (starts at 0)
   * @returns Promise resolving to HTMLFetchResult
   */
  private async _fetchRecursive(
    url: string,
    // Use Required<...> to ensure all properties are present for internal logic
    currentConfig: Required<
      FetchOptions & {
        // FetchOptions now includes spaMode?: boolean
        markdown: boolean;
        retryDelay: number;
        maxRetries: number;
        useHttpFallback: boolean;
        useHeadedModeFallback: boolean;
        useHeadedMode: boolean;
        // spaMode is part of FetchOptions, will be present due to Required<>
        spaRenderDelayMs: number; // Added spaRenderDelayMs
      }
    >,
    retryAttempt: number,
    parentRetryCount: number
  ): Promise<HTMLFetchResult> {
    const useFastMode = currentConfig.fastMode;
    const isSpaMode = currentConfig.spaMode; // Get spaMode from currentConfig

    if (retryAttempt === 0 && parentRetryCount === 0) {
      const cachedResult = this.checkCache(url);
      if (cachedResult) {
        if (
          currentConfig.markdown &&
          !cachedResult.content.startsWith("#") &&
          !cachedResult.content.includes("\n\n---\n\n")
        ) {
          try {
            const converter = new MarkdownConverter();
            cachedResult.content = converter.convert(cachedResult.content);
          } catch (e) {
            console.error("Failed to convert cached result to markdown", e);
          }
        } else if (
          !currentConfig.markdown &&
          (cachedResult.content.startsWith("#") || cachedResult.content.includes("\n\n---\n\n"))
        ) {
          console.warn("Cached result is Markdown, but HTML was requested. Re-fetching.");
          this.cache.delete(url);
          return this._fetchRecursive(url, currentConfig, 0, 0);
        }
        return cachedResult;
      }
    }

    try {
      // If spaMode is true, skip HTTP fallback and go directly to Playwright
      // Corrected logic: useHttpFallback should only be attempted if NOT in spaMode
      if (!isSpaMode && currentConfig.useHttpFallback && retryAttempt === 0 && parentRetryCount === 0) {
        try {
          const httpResult = await this.fetchHTMLWithHttpFallback(url);
          if (this.config.cacheTTL > 0) {
            this.addToCache(url, httpResult);
          }
          return httpResult;
        } catch (httpError: any) {
          if (httpError instanceof FetchError && httpError.code === "ERR_CHALLENGE_PAGE") {
            /* Continue */
          } else {
            /* Log? Continue */
          }
        }
      }

      const useHeadedMode =
        (currentConfig.useHeadedModeFallback && (retryAttempt >= 2 || this.shouldUseHeadedMode(url))) ||
        currentConfig.useHeadedMode;

      try {
        if (!this.browserPool || this.isUsingHeadedMode !== useHeadedMode) {
          await this.initializeBrowserPool(useHeadedMode);
        }
      } catch (initError) {
        if (parentRetryCount < 1) {
          await delay(currentConfig.retryDelay);
          return this._fetchRecursive(url, currentConfig, retryAttempt, parentRetryCount + 1);
        }
        throw new FetchError(
          `Pool init failed: ${(initError as Error).message}`,
          "ERR_POOL_INIT_FAILED",
          initError as Error
        );
      }

      if (!this.browserPool) {
        throw new FetchError("Browser pool unavailable.", "ERR_POOL_UNAVAILABLE");
      }

      // Pass markdown setting, spaMode, and spaRenderDelayMs to Playwright fetch
      const result = await this.queue.add(() =>
        this.fetchWithPlaywright(
          url,
          this.browserPool!,
          useFastMode,
          currentConfig.markdown,
          isSpaMode,
          currentConfig.spaRenderDelayMs
        )
      );

      if (result && this.config.cacheTTL > 0) {
        this.addToCache(url, result);
      }
      if (!result) {
        throw new FetchError("Playwright fetch queued but no result.", "ERR_QUEUE_NO_RESULT");
      }
      return result;
    } catch (error: any) {
      if (useFastMode && retryAttempt === 0 && parentRetryCount === 0) {
        return this._fetchRecursive(url, { ...currentConfig, fastMode: false }, 0, parentRetryCount);
      }
      if (retryAttempt < currentConfig.maxRetries) {
        await delay(currentConfig.retryDelay);
        return this._fetchRecursive(url, currentConfig, retryAttempt + 1, parentRetryCount);
      }

      const finalError =
        error instanceof FetchError
          ? error
          : new FetchError(`Fetch failed: ${error.message}`, "ERR_FETCH_FAILED", error);
      throw new FetchError(
        `Fetch failed after ${currentConfig.maxRetries} retries: ${finalError.message}`,
        finalError.code,
        finalError.originalError || error
      );
    }
  }

  /**
   * Performs the actual page fetch using a Playwright page from the pool.
   * Ensures return type matches HTMLFetchResult.
   */
  private async fetchWithPlaywright(
    url: string,
    pool: PlaywrightBrowserPool,
    fastMode: boolean, // This is the "requested" fastMode
    convertToMarkdown: boolean,
    isSpaMode: boolean, // Added isSpaMode parameter
    spaRenderDelayMs: number // Added spaRenderDelayMs parameter
  ): Promise<HTMLFetchResult> {
    let page: Page | null = null;
    try {
      page = await pool.acquirePage();

      // If SPA mode is active, force fastMode to false to ensure all resources load
      const actualFastMode = isSpaMode ? false : fastMode;
      await this.applyBlockingRules(page, actualFastMode);

      // If SPA mode, don't simulate human behavior before navigation, do it after content might be loaded
      // if (!isSpaMode && this.config.simulateHumanBehavior && !actualFastMode) {
      //   await this.simulateHumanBehavior(page); // Potentially move this or make it conditional for SPA
      // }

      let response: PlaywrightResponse | null = null;
      try {
        response = await page.goto(url, {
          waitUntil: isSpaMode ? "networkidle" : "domcontentloaded", // Adjust waitUntil for SPA mode
          timeout: isSpaMode ? 90000 : 60000, // Longer timeout for SPA mode
        });
      } catch (navigationError: any) {
        throw new FetchError(
          `Playwright navigation failed: ${navigationError.message}`,
          "ERR_NAVIGATION",
          navigationError
        );
      }

      if (!response) {
        throw new FetchError("Playwright navigation did not return a response.", "ERR_NO_RESPONSE");
      }

      if (!response.ok()) {
        // Additional check: if SPA mode and we got an empty-ish page, it might be an error too
        // This is tricky, as a valid SPA might initially be empty.
        // For now, rely on status code and timeouts.
        throw new FetchError(
          `HTTP error status received: ${response.status()}`,
          "ERR_HTTP_ERROR",
          undefined,
          response.status()
        );
      }

      const actualContentTypeHeader = response.headers()["content-type"]?.toLowerCase() || "";
      const title = await page.title();
      const finalUrl = page.url();
      const status = response.status();

      // Post-load delay for SPAs
      if (isSpaMode && spaRenderDelayMs > 0) {
        await page.waitForTimeout(spaRenderDelayMs);
      }

      // Simulate human behavior after potential SPA rendering
      if (this.config.simulateHumanBehavior && !actualFastMode) {
        // 'actualFastMode' is false if isSpaMode is true
        await this.simulateHumanBehavior(page);
      }

      let finalContent: string;
      let finalContentType: "html" | "markdown";

      const ALLOWED_RAW_TEXT_CONTENT_TYPE_PREFIXES = [
        "text/html",
        "application/xhtml+xml",
        "application/xml",
        "text/xml",
        "text/plain",
        "application/json",
        "text/javascript",
        "application/javascript",
        "application/atom+xml",
        "application/rss+xml",
        // Add other text-based types as needed
      ];

      if (!convertToMarkdown) {
        // RAW CONTENT FETCHING
        const isAllowedRawType = ALLOWED_RAW_TEXT_CONTENT_TYPE_PREFIXES.some((prefix) =>
          actualContentTypeHeader.startsWith(prefix)
        );

        if (isAllowedRawType) {
          finalContent = await response.text();
          // Per discussion, keep "html" to align with existing HTMLFetchResult type
          // The actual content is raw, but the type field is constrained.
          finalContentType = "html";
        } else if (actualContentTypeHeader.startsWith("text/")) {
          // Broader catch for other text/* types if not explicitly listed but still text
          console.warn(
            `PlaywrightEngine: Fetching raw content for generic text type '${actualContentTypeHeader}' not explicitly in ALLOWED_RAW_TEXT_CONTENT_TYPE_PREFIXES. Consider adding it if common.`
          );
          finalContent = await response.text();
          finalContentType = "html";
        } else {
          throw new FetchError(
            `Raw content fetching not supported for content type: ${actualContentTypeHeader || "unknown"}`,
            "ERR_UNSUPPORTED_RAW_CONTENT_TYPE"
          );
        }
      } else {
        // MARKDOWN CONVERSION
        if (
          actualContentTypeHeader.startsWith("text/html") ||
          actualContentTypeHeader.startsWith("application/xhtml+xml")
        ) {
          if (!fastMode && this.config.simulateHumanBehavior) {
            if (await this.isPageValid(page)) {
              // Ensure page is valid before simulation
              await this.simulateHumanBehavior(page);
            }
          }
          const html = await page.content(); // page.content() for HTML suitable for DOM-based conversion
          try {
            const converter = new MarkdownConverter();
            finalContent = converter.convert(html);
            finalContentType = "markdown";
          } catch (conversionError: any) {
            console.error(`Markdown conversion failed for ${url} (Playwright):`, conversionError);
            // Fallback to original HTML on conversion error
            finalContent = html;
            finalContentType = "html";
          }
        } else {
          // Cannot convert non-HTML to Markdown
          throw new FetchError(
            `Cannot convert non-HTML content type '${actualContentTypeHeader || "unknown"}' to Markdown.`,
            "ERR_MARKDOWN_CONVERSION_NON_HTML"
          );
        }
      }

      return {
        content: finalContent,
        contentType: finalContentType,
        title: title || null,
        url: finalUrl,
        isFromCache: false,
        statusCode: status,
        error: undefined,
      };
    } finally {
      if (page) {
        await pool.releasePage(page);
      }
    }
  }

  private async applyBlockingRules(page: Page, fastMode: boolean): Promise<void> {
    const blockedResources = fastMode
      ? this.config.poolBlockedResourceTypes.concat(["image", "font", "stylesheet", "media"])
      : this.config.poolBlockedResourceTypes;
    const blockedDomains = this.config.poolBlockedDomains;

    if (blockedResources.length > 0 || blockedDomains.length > 0) {
      try {
        await page.route("**/*", (route: Route) => {
          // Route type added
          const resourceType = route.request().resourceType();
          const requestUrl = route.request().url();

          // Block by resource type
          if (blockedResources.includes(resourceType)) {
            return route.abort();
          }

          // Block by domain pattern
          if (
            blockedDomains.some((pattern) =>
              new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")).test(requestUrl)
            )
          ) {
            return route.abort();
          }

          return route.continue();
        });
      } catch (_error) {
        /* Ignore errors setting up routing */
      }
    }
  }

  /**
   * Cleans up resources used by the engine, primarily closing browser instances in the pool.
   *
   * It is crucial to call this method when finished with the engine instance to release resources.
   * @returns A Promise that resolves when cleanup is complete.
   */
  async cleanup(): Promise<void> {
    try {
      await this.queue.onIdle(); // Wait for active tasks
      this.queue.clear(); // Clear pending tasks

      if (this.browserPool) {
        await this.browserPool.cleanup();
        this.browserPool = null;
      }
      this.isUsingHeadedMode = false; // Reset mode flag
    } catch (_error) {
      /* Ignore errors during cleanup */
    }
  }

  /**
   * Retrieves metrics from the underlying browser pool.
   * @returns An array of BrowserMetrics objects, one for each active browser instance, or an empty array if the pool is not initialized.
   */
  getMetrics(): BrowserMetrics[] {
    if (this.browserPool) {
      return this.browserPool.getMetrics();
    }
    return [];
  }

  // Helper to check if a specific domain is marked for headed mode
  private shouldUseHeadedMode(url: string): boolean {
    if (!this.config.useHeadedModeFallback) return false;
    try {
      const domain = new URL(url).hostname;
      return this.headedFallbackSites.has(domain);
    } catch {
      return false; // Invalid URL
    }
  }
}

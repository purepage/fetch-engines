import { PlaywrightBrowserPool } from "./browser/PlaywrightBrowserPool.js";
import PQueue from "p-queue";
import axios from "axios";
import { FetchError } from "./errors.js"; // Import FetchError
function delay(time) {
    // Added return type
    return new Promise((resolve) => setTimeout(resolve, time));
}
/**
 * PlaywrightEngine - Fetches HTML using a managed pool of headless Playwright browser instances.
 *
 * This engine is suitable for dynamic websites that require JavaScript execution.
 * It incorporates `playwright-extra` with the stealth plugin for enhanced anti-detection capabilities.
 * Features include caching, retries, HTTP fallback, and configurable browser pooling.
 */
export class PlaywrightEngine {
    browserPool = null;
    queue;
    cache = new Map();
    config;
    // Browser pooling safety flags
    initializingBrowserPool = false;
    isUsingHeadedMode = false; // Tracks current pool mode
    headedFallbackSites = new Set(); // Stores domains marked for headed mode
    // Default configuration - Ensure all required fields are present
    static DEFAULT_CONFIG = {
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
        proxy: undefined,
        useHeadedMode: false, // ADDED default
    };
    /**
     * Creates an instance of PlaywrightEngine.
     *
     * @param config Configuration options for the engine and its browser pool.
     *               See `PlaywrightEngineConfig` for details.
     */
    constructor(config = {}) {
        // Merge provided config with defaults
        const mergedConfig = { ...PlaywrightEngine.DEFAULT_CONFIG, ...config };
        // Remove the obsolete stealth keys if they were passed in config
        delete mergedConfig.useStealthMode;
        delete mergedConfig.randomizeFingerprint;
        delete mergedConfig.evasionLevel;
        // Assign cleaned config - type should now match
        this.config = mergedConfig;
        this.queue = new PQueue({ concurrency: this.config.concurrentPages });
    }
    /**
     * Initialize the browser pool with improved error handling and mode switching.
     */
    async initializeBrowserPool(useHeadedMode = false) {
        // Check if pool exists and is in the correct mode
        if (this.browserPool && this.isUsingHeadedMode === useHeadedMode) {
            return; // Already initialized in the correct mode
        }
        // Prevent concurrent initialization attempts
        if (this.initializingBrowserPool) {
            while (this.initializingBrowserPool) {
                await delay(100);
            }
            // Re-check if the pool is now in the correct state after waiting
            if (this.browserPool && this.isUsingHeadedMode === useHeadedMode) {
                return;
            }
            // If still not correct, proceed with initialization (the other process might have failed)
        }
        this.initializingBrowserPool = true;
        try {
            // If pool exists but is in the wrong mode, clean it up first
            if (this.browserPool && this.isUsingHeadedMode !== useHeadedMode) {
                await this.browserPool.cleanup();
                this.browserPool = null;
            }
            this.isUsingHeadedMode = useHeadedMode; // Set the mode *before* creating the pool
            this.browserPool = new PlaywrightBrowserPool({
                maxBrowsers: this.config.maxBrowsers,
                maxPagesPerContext: this.config.maxPagesPerContext,
                maxBrowserAge: this.config.maxBrowserAge,
                healthCheckInterval: this.config.healthCheckInterval,
                useHeadedMode: useHeadedMode,
                // Pass through blocking config
                blockedDomains: this.config.poolBlockedDomains, // Pass from engine config
                blockedResourceTypes: this.config.poolBlockedResourceTypes, // Pass from engine config
            });
            await this.browserPool.initialize();
        }
        catch (error) {
            this.browserPool = null; // Ensure pool is null on failure
            this.isUsingHeadedMode = false; // Reset mode state on failure
            throw error; // Re-throw error
        }
        finally {
            this.initializingBrowserPool = false;
        }
    }
    /**
     * Fallback method using simple HTTP requests via Axios.
     * Ensures return type matches HTMLFetchResult.
     */
    async fetchHTMLWithHttpFallback(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    // Use more standard browser-like headers
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br", // Allow compression
                    Referer: "https://www.google.com/", // Common referer
                    "Upgrade-Insecure-Requests": "1",
                    "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "cross-site",
                    "Sec-Fetch-User": "?1",
                    Connection: "keep-alive", // Keep connection open
                    // Avoid Cache-Control/Pragma unless specifically needed
                },
                maxRedirects: 5,
                timeout: 30000,
                responseType: "text",
                // Decompress response automatically
                decompress: true,
            });
            // Extract title using regex (less robust than DOM parsing)
            const titleMatch = response.data.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : "";
            // Basic check for challenge pages
            const lowerHtml = response.data.toLowerCase();
            const isChallengeOrBot = /cloudflare|checking your browser|please wait|verification|captcha|attention required/i.test(lowerHtml);
            if (isChallengeOrBot) {
                // Throw specific error code for easier handling upstream
                throw new FetchError("Received challenge page via HTTP fallback", "ERR_CHALLENGE_PAGE");
            }
            return {
                html: response.data,
                title: title,
                url: response.request?.res?.responseUrl || response.config.url || url,
                isFromCache: false, // ADDED
                statusCode: response.status, // ADDED
                error: undefined, // ADDED
            };
        }
        catch (error) {
            // Wrap non-FetchErrors
            if (!(error instanceof FetchError)) {
                throw new FetchError(`HTTP fallback failed: ${error.message}`, "ERR_HTTP_FALLBACK_FAILED", error);
            }
            throw error; // Re-throw FetchError or other wrapped errors
        }
    }
    checkCache(url) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
            return cached.result;
        }
        if (cached) {
            this.cache.delete(url); // Explicitly delete expired entry
        }
        return null;
    }
    /**
     * Safely check if a page is still usable and connected.
     */
    async isPageValid(page) {
        if (!page || page.isClosed())
            return false;
        try {
            // Check connection status
            if (!page.context().browser()?.isConnected())
                return false;
            // Try a simple operation that throws if the page is crashed/detached
            await page.evaluate("1 + 1", { timeout: 1000 });
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Simulate human-like interactions on the page.
     */
    async simulateHumanBehavior(page) {
        if (!(await this.isPageValid(page)))
            return;
        try {
            const viewport = page.viewportSize();
            if (!viewport)
                return;
            // Gentle mouse movements
            await page.mouse.move(Math.random() * viewport.width, (Math.random() * viewport.height) / 3, { steps: 5 });
            await delay(150 + Math.random() * 200);
            await page.mouse.move(Math.random() * viewport.width, viewport.height / 2 + (Math.random() * viewport.height) / 2, { steps: 10 });
            await delay(200 + Math.random() * 300);
            // Gentle scrolling
            await page.evaluate(() => {
                window.scrollBy({
                    top: window.innerHeight * (0.3 + Math.random() * 0.4),
                    behavior: "smooth",
                });
            });
            await delay(400 + Math.random() * 600);
            await page.evaluate(() => {
                window.scrollBy({
                    top: window.innerHeight * (0.2 + Math.random() * 0.3),
                    behavior: "smooth",
                });
            });
            await delay(300 + Math.random() * 400);
        }
        catch (_error) {
            /* Ignore errors during simulation */
        }
    }
    /**
     * Adds a result to the in-memory cache.
     */
    addToCache(url, result) {
        if (this.config.cacheTTL <= 0)
            return; // Don't cache if TTL is zero or negative
        const entry = {
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
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchError} If the fetch fails after all retries or encounters critical errors.
     */
    async fetchHTML(url, options = {}) {
        // Start the recursive fetch process with initial retry counts
        return this._fetchRecursive(url, options, 0, 0);
    }
    /**
     * Internal recursive method to handle fetching with retries.
     *
     * @param url URL to fetch
     * @param options Original fetch options (e.g., fastMode override)
     * @param retryAttempt Current retry attempt number (starts at 0)
     * @param parentRetryCount Tracks retries related to pool initialization errors (starts at 0)
     * @returns Promise resolving to HTMLFetchResult
     */
    async _fetchRecursive(url, options, retryAttempt, parentRetryCount) {
        const useFastMode = options.fastMode === undefined
            ? this.config.defaultFastMode
            : options.fastMode;
        // Check cache first
        if (retryAttempt === 0 && parentRetryCount === 0) {
            // Only check cache on the very first try
            const cachedResult = this.checkCache(url);
            if (cachedResult) {
                return cachedResult;
            }
        }
        try {
            // Try HTTP fallback first if enabled and it's the first attempt
            if (this.config.useHttpFallback &&
                retryAttempt === 0 &&
                parentRetryCount === 0) {
                try {
                    const httpResult = await this.fetchHTMLWithHttpFallback(url);
                    // Cache successful HTTP fallback result if caching is enabled
                    if (this.config.cacheTTL > 0) {
                        this.addToCache(url, httpResult);
                    }
                    return httpResult;
                }
                catch (_httpError) {
                    if (_httpError instanceof FetchError &&
                        _httpError.code === "ERR_CHALLENGE_PAGE") {
                        // Challenge page detected, proceed to Playwright
                    }
                    else {
                        // Other HTTP error, re-throw (will be caught below)
                        throw _httpError;
                    }
                }
            }
            // Determine if headed mode should be used for this attempt
            const useHeadedMode = (this.config.useHeadedModeFallback &&
                (retryAttempt >= 2 || this.shouldUseHeadedMode(url))) ||
                this.config.useHeadedMode;
            // Ensure pool is initialized in the correct mode (headed/headless)
            try {
                if (!this.browserPool || this.isUsingHeadedMode !== useHeadedMode) {
                    await this.initializeBrowserPool(useHeadedMode);
                }
            }
            catch (initError) {
                // If pool init fails, retry the entire fetchHTML call (limited times)
                if (parentRetryCount < 1) {
                    await delay(this.config.retryDelay);
                    // Retry the recursive call, incrementing parentRetryCount
                    return this._fetchRecursive(url, options, retryAttempt, parentRetryCount + 1);
                }
                throw new FetchError(`Browser pool initialization failed: ${initError.message}`, "ERR_POOL_INIT_FAILED", initError);
            }
            // If pool still isn't available after potential init, throw.
            if (!this.browserPool) {
                throw new FetchError("Browser pool is not available.", "ERR_POOL_UNAVAILABLE");
            }
            // Execute the actual Playwright fetch within the queue
            const result = await this.queue.add(() => this.fetchWithPlaywright(url, this.browserPool, useFastMode));
            // Cache successful Playwright result if caching is enabled
            if (result && this.config.cacheTTL > 0) {
                this.addToCache(url, result);
            }
            // Need to ensure we return HTMLFetchResult or throw
            if (!result) {
                throw new FetchError("Playwright fetch did not return a result from the queue.", "ERR_QUEUE_NO_RESULT");
            }
            return result;
        }
        catch (error) {
            // Handle retry logic based on the error
            // 1. If in fast mode and this was the first *Playwright* attempt, retry in thorough mode immediately.
            //    (Check parentRetryCount ensures this wasn't a pool init retry)
            if (useFastMode && retryAttempt === 0 && parentRetryCount === 0) {
                return this._fetchRecursive(url, { ...options, fastMode: false }, 0, parentRetryCount);
            }
            // 2. If retries are left, delay and retry with the *same* mode settings.
            if (retryAttempt < this.config.maxRetries) {
                await delay(this.config.retryDelay);
                // Pass the original options and increment retryAttempt
                return this._fetchRecursive(url, options, retryAttempt + 1, parentRetryCount);
            }
            // 3. Max retries exhausted, throw final error
            const fetchError = error instanceof FetchError
                ? error
                : new FetchError(`Fetch failed after ${this.config.maxRetries} retries: ${error.message}`, "ERR_FETCH_FAILED", error);
            // Optionally include the error in the result object if needed for specific use cases,
            // but typically throwing is preferred for signaling failure.
            // return { ... an error result structure ... };
            throw fetchError;
        }
    }
    /**
     * Performs the actual page fetch using a Playwright page from the pool.
     * Ensures return type matches HTMLFetchResult.
     */
    async fetchWithPlaywright(url, pool, fastMode) {
        let page = null;
        try {
            page = await pool.acquirePage();
            await this.applyBlockingRules(page, fastMode);
            let response = null;
            try {
                response = await page.goto(url, {
                    waitUntil: "domcontentloaded",
                    timeout: 60000,
                }); // Use domcontentloaded, adjust timeout
            }
            catch (navigationError) {
                throw new FetchError(`Playwright navigation failed: ${navigationError.message}`, "ERR_NAVIGATION", navigationError);
            }
            // Optional: Add a small delay or check for specific elements if needed after load
            // await delay(500);
            if (!response) {
                throw new FetchError("Playwright navigation did not return a response.", "ERR_NO_RESPONSE");
            }
            if (!response.ok()) {
                throw new FetchError(`HTTP error status received: ${response.status()}`, "ERR_HTTP_ERROR", undefined, response.status());
            }
            const contentType = response.headers()["content-type"] || "";
            if (!contentType.includes("html")) {
                throw new FetchError(`Invalid content type received: ${contentType}`, "ERR_NON_HTML_CONTENT");
            }
            if (!fastMode && this.config.simulateHumanBehavior) {
                await this.simulateHumanBehavior(page);
            }
            const html = await page.content();
            const title = await page.title();
            return {
                html,
                title,
                url: page.url(), // Get final URL from page
                isFromCache: false, // ADDED
                statusCode: response.status(), // ADDED
                error: undefined, // ADDED
            };
        }
        finally {
            if (page) {
                await pool.releasePage(page);
            }
        }
    }
    async applyBlockingRules(page, fastMode) {
        const blockedResources = fastMode
            ? this.config.poolBlockedResourceTypes.concat([
                "image",
                "font",
                "stylesheet",
                "media",
            ])
            : this.config.poolBlockedResourceTypes;
        const blockedDomains = this.config.poolBlockedDomains;
        if (blockedResources.length > 0 || blockedDomains.length > 0) {
            try {
                await page.route("**/*", (route) => {
                    // Route type added
                    const resourceType = route.request().resourceType();
                    const requestUrl = route.request().url();
                    // Block by resource type
                    if (blockedResources.includes(resourceType)) {
                        return route.abort();
                    }
                    // Block by domain pattern
                    if (blockedDomains.some((pattern) => new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*")).test(requestUrl))) {
                        return route.abort();
                    }
                    return route.continue();
                });
            }
            catch (_error) {
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
    async cleanup() {
        try {
            await this.queue.onIdle(); // Wait for active tasks
            this.queue.clear(); // Clear pending tasks
            if (this.browserPool) {
                await this.browserPool.cleanup();
                this.browserPool = null;
            }
            this.isUsingHeadedMode = false; // Reset mode flag
        }
        catch (_error) {
            /* Ignore errors during cleanup */
        }
    }
    /**
     * Retrieves metrics from the underlying browser pool.
     * @returns An array of BrowserMetrics objects, one for each active browser instance, or an empty array if the pool is not initialized.
     */
    getMetrics() {
        if (this.browserPool) {
            return this.browserPool.getMetrics();
        }
        return [];
    }
    // Helper to check if a specific domain is marked for headed mode
    shouldUseHeadedMode(url) {
        if (!this.config.useHeadedModeFallback)
            return false;
        try {
            const domain = new URL(url).hostname;
            return this.headedFallbackSites.has(domain);
        }
        catch {
            return false; // Invalid URL
        }
    }
}
//# sourceMappingURL=PlaywrightEngine.js.map
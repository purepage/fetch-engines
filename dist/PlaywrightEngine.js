import { PlaywrightBrowserPool } from "./browser/PlaywrightBrowserPool.js";
import PQueue from "p-queue";
import axios from "axios";
import { FetchError } from "./errors.js"; // Import FetchError
import { MarkdownConverter } from "./utils/markdown-converter.js"; // Import the converter
import { DEFAULT_HTTP_TIMEOUT, SHORT_DELAY_MS, EVALUATION_TIMEOUT_MS, COMMON_HEADERS, MAX_REDIRECTS, REGEX_TITLE_TAG, REGEX_SIMPLE_HTML_TITLE_FALLBACK, REGEX_SANITIZE_HTML_TAGS, REGEX_CHALLENGE_PAGE_KEYWORDS, HUMAN_SIMULATION_MIN_DELAY_MS, HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS, HUMAN_SIMULATION_SCROLL_DELAY_MS, HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS, } from "./constants.js"; // Corrected path
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
        useHeadedMode: false,
        markdown: true,
        spaMode: false,
        spaRenderDelayMs: 0,
        playwrightOnlyPatterns: [],
        playwrightLaunchOptions: undefined, // Added default for playwrightLaunchOptions
    };
    /**
     * Creates an instance of PlaywrightEngine.
     *
     * @param config Configuration options for the engine and its browser pool.
     *               See `PlaywrightEngineConfig` for details.
     */
    constructor(config = {}) {
        // Merge provided config with defaults
        this.config = { ...PlaywrightEngine.DEFAULT_CONFIG, ...config };
        this.queue = new PQueue({ concurrency: this.config.concurrentPages });
    }
    /**
     * Initialize the browser pool with improved error handling and mode switching.
     */
    async initializeBrowserPool(useHeadedMode = false) {
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
                launchOptions: this.config.playwrightLaunchOptions,
            });
            await this.browserPool.initialize();
        }
        catch (error) {
            this.browserPool = null;
            this.isUsingHeadedMode = false;
            throw error;
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
            let finalContentType = "html";
            // Apply markdown conversion here if the *engine config* option is set
            // NOTE: This currently uses engine config, not per-request. Could be refined.
            if (this.config.markdown) {
                try {
                    const converter = new MarkdownConverter();
                    finalContent = converter.convert(originalHtml);
                    finalContentType = "markdown";
                }
                catch (conversionError) {
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
        }
        catch (error) {
            if (!(error instanceof FetchError)) {
                const message = error instanceof Error ? error.message : String(error);
                const cause = error instanceof Error ? error : undefined;
                throw new FetchError(`HTTP fallback failed: ${message}`, "ERR_HTTP_FALLBACK_FAILED", cause);
            }
            throw error; // Re-throw FetchError or other wrapped errors
        }
    }
    checkCache(url) {
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
    async isPageValid(page) {
        if (!page || page.isClosed())
            return false;
        try {
            // Check connection status
            if (!page.context().browser()?.isConnected())
                return false;
            // Try a simple operation that throws if the page is crashed/detached
            await page.evaluate("1 + 1", { timeout: EVALUATION_TIMEOUT_MS });
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
            await delay(HUMAN_SIMULATION_MIN_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS);
            await page.mouse.move(Math.random() * viewport.width, viewport.height / 2 + (Math.random() * viewport.height) / 2, { steps: 10 });
            await delay(HUMAN_SIMULATION_SCROLL_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS);
            // Gentle scroll
            const scrollAmount = Math.floor(Math.random() * (viewport.height / 2)) + viewport.height / 4;
            await page.evaluate((scroll) => window.scrollBy(0, scroll), scrollAmount);
            await delay(HUMAN_SIMULATION_SCROLL_DELAY_MS + Math.random() * HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS);
            // Additional random small mouse movements
            for (let i = 0; i < 2; i++) {
                if (!(await this.isPageValid(page)))
                    break;
                await page.mouse.move(Math.random() * viewport.width, Math.random() * viewport.height, {
                    steps: 3 + Math.floor(Math.random() * 3),
                });
                await delay(HUMAN_SIMULATION_MIN_DELAY_MS / 2 + Math.random() * (HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS / 2));
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // Errors during human-like simulation are logged for debugging but do not fail the operation.
            console.debug(`Error during human-like simulation on page ${page.url()}: ${message}`, err instanceof Error ? err : undefined);
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
     * @param options.spaMode Overrides the engine's `spaMode` configuration for this request.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchError} If the fetch fails after all retries or encounters critical errors.
     */
    async fetchHTML(url, options = {}) {
        const fetchConfig = {
            ...this.config,
            markdown: options.markdown === undefined ? this.config.markdown : options.markdown,
            fastMode: options.fastMode === undefined ? this.config.defaultFastMode : options.fastMode,
            spaMode: options.spaMode === undefined ? this.config.spaMode : options.spaMode,
            // Ensure all fields expected by _fetchRecursive's currentConfig are present
            // Most come from this.config, which is ResolvedPlaywrightEngineConfig
            // Check if playwrightOnlyPatterns is needed in _fetchRecursive context (likely not)
        };
        // Try removing 'as any' to see the specific type error
        return this._fetchRecursive(url, fetchConfig, 0);
    }
    /**
     * Helper to check cache and potentially return a cached result.
     * Handles logic for re-fetching if cache is stale or content type mismatch for markdown.
     *
     * @param url URL to check in cache
     * @param currentConfig Current fetch configuration
     * @returns Cached result or null if not found/needs re-fetch.
     */
    _handleCacheCheck(url, currentConfig) {
        const cachedResult = this.checkCache(url);
        if (cachedResult) {
            // Check if markdown conversion is needed or if there's a type mismatch
            const needsMarkdown = currentConfig.markdown;
            const isMarkdown = cachedResult.contentType === "markdown" ||
                (typeof cachedResult.content === "string" &&
                    (cachedResult.content.startsWith("#") || cachedResult.content.includes("\n\n---\n\n")));
            if (needsMarkdown && !isMarkdown) {
                // Cached HTML, but Markdown requested
                try {
                    const converter = new MarkdownConverter();
                    // Convert a copy, do not mutate the cached object directly
                    const convertedContent = converter.convert(cachedResult.content);
                    return {
                        ...cachedResult,
                        content: convertedContent,
                        contentType: "markdown",
                    };
                }
                catch (e) {
                    console.error(`Failed to convert cached HTML to markdown for ${url}:`, e);
                    this.cache.delete(url); // Invalidate cache on conversion failure
                    return null; // Trigger re-fetch
                }
            }
            else if (!needsMarkdown && isMarkdown) {
                // Cached Markdown, but HTML requested
                console.warn(`Cached result for ${url} is Markdown, but HTML was requested. Re-fetching.`);
                this.cache.delete(url);
                return null; // Trigger re-fetch
            }
            // Cache hit and content type is appropriate
            return cachedResult;
        }
        return null; // Cache miss
    }
    /**
     * Attempts to fetch the URL using a simple HTTP GET request as a fallback.
     *
     * @param url The URL to fetch.
     * @param currentConfig The current fetch configuration.
     * @returns A Promise resolving to an HTMLFetchResult if successful, or null if fallback is skipped or a challenge page is encountered.
     * @throws {FetchError} If the HTTP fallback itself fails with an unrecoverable error.
     */
    async _attemptHttpFallback(url, currentConfig) {
        if (!currentConfig.useHttpFallback) {
            return null;
        }
        try {
            const httpResult = await this.fetchHTMLWithHttpFallback(url);
            // If successful, cache it (addToCache handles TTL check)
            this.addToCache(url, httpResult);
            return httpResult;
        }
        catch (httpError) {
            if (httpError instanceof FetchError && httpError.code === "ERR_CHALLENGE_PAGE") {
                // Log or specific handling for challenge page if needed, then signal to proceed with Playwright
                console.warn(`HTTP fallback for ${url} resulted in a challenge page. Proceeding with Playwright.`);
                return null;
            }
            else {
                // For other HTTP fallback errors, log them but still allow proceeding to Playwright
                // as per original logic (empty catch block).
                console.warn(`HTTP fallback for ${url} failed: ${httpError.message}. Proceeding with Playwright.`);
                return null;
            }
        }
    }
    /**
     * Ensures the browser pool is initialized with the correct mode (headed/headless).
     * Handles one retry attempt if the initial pool initialization fails.
     *
     * @param useHeadedMode Whether to initialize the pool in headed mode.
     * @param currentConfig The current fetch configuration (for retryDelay).
     * @returns A Promise that resolves when the pool is initialized, or rejects if initialization fails after retries.
     * @throws {FetchError} If pool initialization fails after retries or if the pool is unavailable.
     */
    async _ensureBrowserPoolInitialized(useHeadedMode, currentConfig) {
        // This check is slightly different from initializeBrowserPool internal check,
        // as it needs to be called before attempting initialization within _fetchRecursive
        if (this.browserPool && this.isUsingHeadedMode === useHeadedMode) {
            return; // Pool already initialized with the correct mode
        }
        try {
            await this.initializeBrowserPool(useHeadedMode);
        }
        catch (initError) {
            // Allow one retry for pool initialization failure as per original _fetchRecursive logic
            console.warn(`Browser pool initialization failed. Retrying once after delay... Error: ${initError.message}`);
            await delay(currentConfig.retryDelay);
            try {
                await this.initializeBrowserPool(useHeadedMode);
            }
            catch (secondInitError) {
                throw new FetchError(`Pool initialization failed after retry: ${secondInitError.message}`, "ERR_POOL_INIT_FAILED", secondInitError);
            }
        }
        if (!this.browserPool) {
            // Simplified check: if pool is null after attempts, it's an error.
            throw new FetchError("Browser pool unavailable after initialization attempt.", "ERR_POOL_UNAVAILABLE");
        }
    }
    /**
     * Internal recursive method to handle fetching with retries.
     *
     * @param url URL to fetch
     * @param currentConfig The merged configuration including markdown option
     * @param retryAttempt Current retry attempt number (starts at 0)
     * @returns Promise resolving to HTMLFetchResult
     */
    async _fetchRecursive(url, currentConfig, retryAttempt) {
        const isSpaMode = currentConfig.spaMode;
        // 1. Cache Check (only on the very first attempt)
        if (retryAttempt === 0) {
            const cachedResult = this._handleCacheCheck(url, currentConfig);
            if (cachedResult) {
                return cachedResult;
            }
        }
        // 2. HTTP Fallback (only on the very first attempt, if not SPA mode)
        if (retryAttempt === 0 && !isSpaMode) {
            const fallbackResult = await this._attemptHttpFallback(url, currentConfig);
            if (fallbackResult) {
                return fallbackResult;
            }
        }
        // 3. Main Playwright Fetch Logic with Retries
        try {
            const useHeadedMode = (currentConfig.useHeadedModeFallback && (retryAttempt >= 2 || this.shouldUseHeadedMode(url))) ||
                currentConfig.useHeadedMode;
            await this._ensureBrowserPoolInitialized(useHeadedMode, currentConfig);
            // browserPool is guaranteed to be non-null here by _ensureBrowserPoolInitialized
            // The non-null assertion operator (!) is safe to use here.
            const result = await this.queue.add(() => this.fetchWithPlaywright(url, this.browserPool, currentConfig.fastMode, // Pass the current fastMode setting
            currentConfig.markdown, isSpaMode, currentConfig.spaRenderDelayMs));
            if (!result) {
                // Should not happen if fetchWithPlaywright resolves, but good to check.
                throw new FetchError("Playwright fetch queued but no result returned.", "ERR_QUEUE_NO_RESULT");
            }
            this.addToCache(url, result); // Cache successful Playwright result
            return result;
        }
        catch (error) {
            // Retry logic:
            // a. If it was a fastMode attempt and it failed, retry once with fastMode=false before counting as a main retry.
            if (currentConfig.fastMode && retryAttempt === 0) {
                console.warn(`Fast mode fetch failed for ${url}. Retrying with fastMode disabled.`);
                return this._fetchRecursive(url, { ...currentConfig, fastMode: false }, 0); // Reset retryAttempt for the non-fastMode attempt
            }
            // b. Standard retry mechanism
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (retryAttempt < currentConfig.maxRetries) {
                console.warn(`Fetch attempt ${retryAttempt + 1} for ${url} failed. Retrying after delay... Error: ${errorMessage}`);
                await delay(currentConfig.retryDelay);
                return this._fetchRecursive(url, currentConfig, retryAttempt + 1);
            }
            // c. If retries exhausted for current mode, AND current mode is headless, AND headed fallback is enabled:
            //    Attempt to switch to headed mode.
            //    The error type check (e.g. specific Playwright errors) can be added here if needed.
            if (!currentConfig.useHeadedMode && currentConfig.useHeadedModeFallback) {
                console.warn(`All headless attempts for ${url} (retries: ${retryAttempt}/${currentConfig.maxRetries}) failed. Attempting headed mode fallback.`);
                // Create a new config for the headed attempt. Reset retryAttempt for this new mode.
                // For this headed fallback attempt, let's use maxRetries: 0 to ensure it's a single try.
                const headedConfig = {
                    ...currentConfig,
                    useHeadedMode: true,
                    retryAttempt: 0, // Reset for the new mode
                    maxRetries: 0, // Single attempt for headed fallback
                };
                return this._fetchRecursive(url, headedConfig, 0);
            }
            // d. Max retries reached (and no applicable headed fallback)
            const originalErrorAsError = error instanceof Error ? error : undefined;
            const finalError = error instanceof FetchError
                ? error
                : new FetchError(`Fetch failed: ${errorMessage}`, "ERR_FETCH_FAILED", originalErrorAsError);
            throw new FetchError(`Fetch failed for ${url} after ${currentConfig.maxRetries} retries (and potential fastMode retry): ${finalError.message}`, finalError.code || "ERR_MAX_RETRIES_REACHED", finalError.originalError || originalErrorAsError);
        }
    }
    /**
     * Performs the actual page fetch using a Playwright page from the pool.
     * Ensures return type matches HTMLFetchResult.
     */
    async fetchWithPlaywright(url, pool, fastMode, // This is the "requested" fastMode
    convertToMarkdown, isSpaMode, // Added isSpaMode parameter
    spaRenderDelayMs // Added spaRenderDelayMs parameter
    ) {
        let page = null;
        try {
            try {
                page = await pool.acquirePage();
            }
            catch (acquireError) {
                if (acquireError instanceof FetchError)
                    throw acquireError;
                throw new FetchError(`Playwright page acquisition failed: ${acquireError.message}`, "ERR_PLAYWRIGHT_OPERATION", // Specific code for acquisition failure
                acquireError);
            }
            // If SPA mode is active, force fastMode to false to ensure all resources load
            const actualFastMode = isSpaMode ? false : fastMode;
            await this.applyBlockingRules(page, actualFastMode);
            // If SPA mode, don't simulate human behavior before navigation, do it after content might be loaded
            // if (!isSpaMode && this.config.simulateHumanBehavior && !actualFastMode) {
            //   await this.simulateHumanBehavior(page); // Potentially move this or make it conditional for SPA
            // }
            let response = null;
            try {
                response = await page.goto(url, {
                    waitUntil: isSpaMode ? "networkidle" : "domcontentloaded", // Adjust waitUntil for SPA mode
                    timeout: isSpaMode ? 90000 : 60000, // Longer timeout for SPA mode
                });
            }
            catch (navigationError) {
                throw new FetchError(`Playwright navigation failed: ${navigationError.message}`, "ERR_NAVIGATION", navigationError);
            }
            if (!response) {
                throw new FetchError("Playwright navigation did not return a response.", "ERR_NO_RESPONSE");
            }
            if (!response.ok()) {
                // Additional check: if SPA mode and we got an empty-ish page, it might be an error too
                // This is tricky, as a valid SPA might initially be empty.
                // For now, rely on status code and timeouts.
                throw new FetchError(`HTTP error status received: ${response.status()}`, "ERR_HTTP_ERROR", undefined, response.status());
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
            let finalContent;
            let finalContentType;
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
                const isAllowedRawType = ALLOWED_RAW_TEXT_CONTENT_TYPE_PREFIXES.some((prefix) => actualContentTypeHeader.startsWith(prefix));
                if (isAllowedRawType) {
                    finalContent = await response.text();
                    // Per discussion, keep "html" to align with existing HTMLFetchResult type
                    // The actual content is raw, but the type field is constrained.
                    finalContentType = "html";
                }
                else if (actualContentTypeHeader.startsWith("text/")) {
                    // Broader catch for other text/* types if not explicitly listed but still text
                    console.warn(`PlaywrightEngine: Fetching raw content for generic text type '${actualContentTypeHeader}' not explicitly in ALLOWED_RAW_TEXT_CONTENT_TYPE_PREFIXES. Consider adding it if common.`);
                    finalContent = await response.text();
                    finalContentType = "html";
                }
                else {
                    throw new FetchError(`Raw content fetching not supported for content type: ${actualContentTypeHeader || "unknown"}`, "ERR_UNSUPPORTED_RAW_CONTENT_TYPE");
                }
            }
            else {
                // MARKDOWN CONVERSION
                if (actualContentTypeHeader.startsWith("text/html") ||
                    actualContentTypeHeader.startsWith("application/xhtml+xml")) {
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
                    }
                    catch (conversionError) {
                        console.error(`Markdown conversion failed for ${url} (Playwright):`, conversionError);
                        // Fallback to original HTML on conversion error
                        finalContent = html;
                        finalContentType = "html";
                    }
                }
                else {
                    // Cannot convert non-HTML to Markdown
                    throw new FetchError(`Cannot convert non-HTML content type '${actualContentTypeHeader || "unknown"}' to Markdown.`, "ERR_MARKDOWN_CONVERSION_NON_HTML");
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
        }
        finally {
            if (page) {
                await pool.releasePage(page);
            }
        }
    }
    async applyBlockingRules(page, fastMode) {
        const blockedResources = fastMode
            ? this.config.poolBlockedResourceTypes.concat(["image", "font", "stylesheet", "media"])
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
            catch (routingError) {
                const message = routingError instanceof Error ? routingError.message : String(routingError);
                // Errors setting up routing are logged for debugging but do not fail the operation,
                // as fetching can proceed without custom routing, albeit potentially less efficiently.
                console.debug(`Error setting up Playwright routing rules: ${message}`, routingError instanceof Error ? routingError : undefined);
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
        catch (cleanupError) {
            const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            // Errors during cleanup are logged as warnings, as they might indicate resource leak issues.
            console.warn(`Error during PlaywrightEngine cleanup: ${message}`, cleanupError instanceof Error ? cleanupError : undefined);
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
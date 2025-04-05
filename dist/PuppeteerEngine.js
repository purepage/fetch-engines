"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerEngine = void 0;
const BrowserPool_1 = require("./browser/BrowserPool");
const p_queue_1 = __importDefault(require("p-queue"));
function delay(time) {
    // Added return type
    return new Promise((resolve) => setTimeout(resolve, time));
}
/**
 * PuppeteerEngine - A headless browser engine that uses Puppeteer to render JavaScript-heavy pages
 * Ideal for SPAs and sites with anti-scraping measures
 */
class PuppeteerEngine {
    constructor(concurrentPages = 3) {
        this.cache = new Map();
        this.cacheTTL = 15 * 60 * 1000; // 15 minutes cache TTL
        this.isInitializing = false; // Flag to prevent concurrent initialization
        this.queue = new p_queue_1.default({ concurrency: concurrentPages });
        // Initialize pool lazily on first fetchHTML call instead of constructor
        // this.initializeBrowserPool(); // Removed from constructor
        // Graceful shutdown handling
        const cleanup = async () => {
            console.log("Shutting down PuppeteerEngine...");
            await this.cleanup();
            // Let the calling process handle exit
            // process.exit(0); // Removed process.exit
        };
        // Consider removing these global handlers if the engine is used as a library
        // The application using the library should manage its lifecycle.
        process.on("SIGTERM", cleanup);
        process.on("SIGINT", cleanup);
    }
    async initializeBrowserPool() {
        // Made async, added return type
        if (PuppeteerEngine.browserPool || this.isInitializing) {
            // Wait if initialization is already in progress
            while (this.isInitializing) {
                await delay(100);
            }
            return;
        }
        this.isInitializing = true;
        try {
            console.log("Initializing Puppeteer Browser Pool...");
            PuppeteerEngine.browserPool = new BrowserPool_1.BrowserPool(2, // maxBrowsers
            6, // maxPagesPerBrowser
            60 * 60 * 1000, // maxBrowserAge (1 hour)
            60 * 1000 // healthCheckInterval (1 minute)
            );
            await PuppeteerEngine.browserPool.initialize();
            console.log("Puppeteer Browser Pool initialized.");
        }
        catch (error) {
            console.error("Failed to initialize Puppeteer browser pool:", error);
            PuppeteerEngine.browserPool = null; // Ensure pool is null on failure
            throw error; // Re-throw error
        }
        finally {
            this.isInitializing = false;
        }
    }
    async fetchHTML(url) {
        // Check cache first
        const cachedResult = this.checkCache(url);
        if (cachedResult) {
            console.log(`Cache hit for ${url}`);
            return cachedResult;
        }
        // Ensure browser pool is initialized before processing
        await this.initializeBrowserPool();
        if (!PuppeteerEngine.browserPool) {
            throw new Error("Browser pool is not available after initialization attempt.");
        }
        const fetchPromise = this.queue.add(async () => {
            const metrics = [];
            const totalStart = performance.now();
            let page = null; // Initialize page as null
            try {
                // Fall back to Puppeteer
                // Get page from pool
                const pageStart = performance.now();
                if (!PuppeteerEngine.browserPool)
                    throw new Error("Browser pool is null"); // Guard against null pool
                page = await PuppeteerEngine.browserPool.acquirePage();
                metrics.push({
                    operation: "acquire_page",
                    duration: performance.now() - pageStart,
                });
                // Pre-navigation setup
                const setupStart = performance.now();
                // Set a realistic user agent
                await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
                // Set extra headers
                await page.setExtraHTTPHeaders({
                    "Accept-Language": "en-US,en;q=0.9",
                    Referer: "https://www.google.com/",
                    "Sec-Ch-Ua": '"Chromium";v="122", "Google Chrome";v="122", "Not(A:Brand";v="24"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"macOS"',
                });
                // Enable JavaScript
                await page.setJavaScriptEnabled(true);
                // Set cookies (consider making domain more specific if possible)
                try {
                    const hostname = new URL(url).hostname;
                    const domain = hostname.startsWith("www.") ? hostname.substring(4) : hostname;
                    await page.setCookie({
                        name: "cookie_consent",
                        value: "accepted",
                        domain: `.${domain}`, // Use extracted domain
                        path: "/",
                    });
                }
                catch (e) {
                    console.warn(`Could not set cookie for URL ${url}: ${e instanceof Error ? e.message : String(e)}`);
                }
                // Adaptive request interception based on URL content guess
                const isLikelyMediaSite = /music|record|audio|video|stream|artist|label|release|track|album/i.test(url);
                await page.setRequestInterception(true);
                const requestHandler = (request /* puppeteer.HTTPRequest */) => {
                    const resourceType = request.resourceType();
                    const requestUrl = request.url();
                    // Block common tracking/analytics/ads/fonts/images unless it's a media site
                    if (!isLikelyMediaSite &&
                        (["font", "image", "media", "stylesheet"].includes(resourceType) ||
                            /google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.net|twitter\.com/.test(requestUrl))) {
                        request.abort().catch((e) => console.warn(`Failed to abort request: ${e.message}`));
                    }
                    else {
                        request.continue().catch((e) => console.warn(`Failed to continue request: ${e.message}`));
                    }
                };
                page.on("request", requestHandler); // Assign handler
                await page.setDefaultNavigationTimeout(45000); // Increased timeout
                metrics.push({
                    operation: "page_setup",
                    duration: performance.now() - setupStart,
                });
                // Navigation
                const navigationStart = performance.now();
                let response;
                try {
                    if (isLikelyMediaSite) {
                        // Relaxed approach for media sites
                        response = await page.goto(url, {
                            waitUntil: ["domcontentloaded", "networkidle2"], // Wait for DOM and less strict network idle
                            timeout: 40000,
                        });
                        // Basic interactions to trigger content loading
                        await page
                            .evaluate(() => {
                            window.scrollTo(0, document.body.scrollHeight / 2);
                            const buttons = Array.from(document.querySelectorAll("button")).filter((b) => /cookie|accept|agree/i.test(b.textContent || ""));
                            buttons.forEach((b) => b.click());
                        })
                            .catch((e) => console.warn(`Media site interaction error: ${e.message}`));
                        await delay(3000); // Wait for potential dynamic content
                    }
                    else {
                        // Cautious approach for other sites
                        response = await page.goto(url, {
                            waitUntil: "domcontentloaded", // Faster initial load
                            timeout: 30000,
                        });
                        // Check for Cloudflare/challenge pages
                        const isChallengePage = await page.evaluate(() => {
                            const title = document.title || "";
                            const bodyText = document.body?.textContent || "";
                            return (/Just a moment|Attention Required|Security check|Enable JavaScript and cookies|Please wait while we verify|Please enable Cookies|DDoS protection|Cloudflare/i.test(title + bodyText) || document.querySelector("#challenge-form, #cf-challenge-running") !== null);
                        });
                        if (isChallengePage) {
                            console.log(`Detected challenge page for ${url}, waiting...`);
                            try {
                                // Wait for title change or specific element disappearance
                                await page.waitForFunction(() => {
                                    const title = document.title;
                                    return (!/Just a moment|Attention Required|Security check/i.test(title) &&
                                        !document.querySelector("#challenge-form, #cf-challenge-running"));
                                }, { timeout: 25000 } // Increased wait time
                                );
                                console.log("Challenge appears resolved, continuing...");
                                await delay(5000); // Extra wait after challenge resolution
                                // Refresh response object after potential navigation/reload by challenge
                                response = page.mainFrame().Mresponse(); // Get current response
                                if (!response) {
                                    // Reload if no response object found
                                    response = await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
                                }
                            }
                            catch (challengeError) {
                                console.warn(`Challenge wait timed out or failed for ${url}:`, challengeError);
                                // Try to interact with potential challenge elements as fallback
                                await page
                                    .evaluate(() => {
                                    document
                                        .querySelectorAll('button, input[type="submit"], .cf-button, input[type="checkbox"]')
                                        .forEach((el) => {
                                        try {
                                            el.click();
                                        }
                                        catch (e) { }
                                        if (el.type === "checkbox")
                                            el.checked = true;
                                    });
                                })
                                    .catch((e) => console.warn(`Challenge interaction error: ${e.message}`));
                                await delay(3000);
                                try {
                                    response = await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
                                }
                                catch (reloadError) {
                                    console.warn(`Reload after challenge interaction failed for ${url}:`, reloadError);
                                    // Proceed with whatever state the page is in
                                }
                            }
                        }
                        else {
                            // If not a challenge page, wait for network idle or a timeout
                            await Promise.race([
                                page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => { }),
                                delay(5000), // Min wait time
                            ]);
                        }
                    }
                }
                catch (navigationError) {
                    console.error(`Primary navigation failed for ${url}:`, navigationError);
                    const errorMsg = navigationError instanceof Error ? navigationError.message : String(navigationError);
                    // Handle frame detached errors specifically if needed, otherwise rethrow or fallback
                    if (/frame was detached|context destroyed|detached Frame/i.test(errorMsg)) {
                        console.warn(`Frame detached during navigation for ${url}, attempting final content grab.`);
                        // Attempt to grab content immediately before potentially closing the page
                        const html = await page.content().catch(() => "");
                        const title = await page.title().catch(() => "Content Unavailable");
                        if (html) {
                            return { html, title, url: page.url() };
                        }
                        else {
                            throw new Error(`Navigation failed (Frame Detached) for ${url}`); // Rethrow if content grab fails
                        }
                    }
                    else {
                        throw navigationError; // Rethrow other navigation errors
                    }
                }
                finally {
                    page.off("request", requestHandler); // Remove listener
                    await page.setRequestInterception(false); // Turn off interception
                }
                metrics.push({
                    operation: "navigation_complete",
                    duration: performance.now() - navigationStart,
                });
                if (!response) {
                    console.warn(`No valid response object after navigation for ${url}. Trying to get content anyway.`);
                    // Attempt to proceed even without a response object, page might still have content
                }
                else if (!response.ok()) {
                    console.warn(`Navigation response not OK for ${url}: Status ${response.status()}`);
                    // Decide whether to throw or try to extract content based on status code
                    if (response.status() >= 400 && response.status() < 500) {
                        // Client errors
                        throw new Error(`Client error fetching ${url}: Status ${response.status()}`);
                    }
                    // For server errors (5xx), we might still attempt content extraction
                }
                // Wait for potential SPA content rendering
                const spaWaitStart = performance.now();
                try {
                    // Wait for a combination of potential content indicators or a timeout
                    await Promise.race([
                        page
                            .waitForSelector('h1, h2, main, article, .container, [class*="content"], [id*="content"]', {
                            timeout: 15000,
                            visible: true,
                        })
                            .catch(() => { }),
                        page
                            .waitForFunction(() => (document.body?.textContent || "").length > 200, { timeout: 15000 })
                            .catch(() => { }),
                        delay(5000), // Minimum wait
                    ]);
                }
                catch (waitError) {
                    console.warn(`SPA content wait potentially failed for ${url}:`, waitError);
                }
                finally {
                    metrics.push({
                        operation: "spa_content_wait",
                        duration: performance.now() - spaWaitStart,
                    });
                }
                // Content extraction
                const extractStart = performance.now();
                let html, title;
                // Generic extraction attempt focused on main content areas
                const pageData = await page.evaluate(() => {
                    const mainContent = document.querySelector("main, article, #main-content, .main-content, #content, .content")?.innerHTML;
                    return {
                        html: mainContent || document.documentElement.outerHTML, // Fallback to full HTML
                        title: document.title || document.querySelector("h1")?.textContent || "",
                    };
                });
                html = pageData.html;
                title = pageData.title;
                // Fallback if extraction yields minimal content
                if (!html || html.length < 150) {
                    console.warn(`Minimal content extracted for ${url}, falling back to full page content.`);
                    html = await page.content();
                    title = await page.title(); // Re-fetch title as it might have updated
                }
                metrics.push({
                    operation: "content_extraction",
                    duration: performance.now() - extractStart,
                });
                metrics.push({
                    operation: "total_time",
                    duration: performance.now() - totalStart,
                });
                console.log("Puppeteer fetch successful:", {
                    url,
                    status: response?.status() ?? "N/A",
                    metrics: metrics.map((m) => `${m.operation}: ${m.duration.toFixed(0)}ms`).join(", "), // Simplified metrics logging
                });
                const finalResult = {
                    html,
                    title,
                    url: page.url(), // Get final URL after potential redirects
                };
                // Cache the successful result
                this.cacheResult(url, finalResult);
                return finalResult;
            }
            catch (error) {
                console.error(`PuppeteerEngine fetch failed for ${url}:`, error instanceof Error ? error.message : String(error), { metrics });
                // Decide if the error is critical enough to invalidate the page/browser? Maybe not here.
                throw error; // Re-throw the error to be handled by the caller or queue
            }
            finally {
                if (page) {
                    // Ensure page is closed even if errors occurred
                    await page.close().catch((e) => console.warn(`Error closing page for ${url}: ${e.message}`));
                }
            }
        });
        // Type assertion as PQueue returns Promise<unknown> by default
        return fetchPromise;
    }
    checkCache(url) {
        const cached = this.cache.get(url);
        if (!cached)
            return null;
        const now = Date.now();
        if (now - cached.timestamp > this.cacheTTL) {
            // Cache expired
            this.cache.delete(url);
            console.log(`Cache expired for ${url}`);
            return null;
        }
        return cached.result;
    }
    cacheResult(url, result) {
        this.cache.set(url, {
            result,
            timestamp: Date.now(),
        });
        console.log(`Cached result for ${url}`);
        // Simple cache cleanup strategy: clean oldest if cache exceeds size limit
        if (this.cache.size > 100) {
            // Set a reasonable cache size limit
            const oldestUrl = this.cache.keys().next().value;
            if (oldestUrl) {
                this.cache.delete(oldestUrl);
                console.log(`Cache limit reached, removed oldest entry: ${oldestUrl}`);
            }
        }
    }
    // Removed cleanupCache method as logic is now inline in cacheResult
    async cleanup() {
        console.log("Cleaning up PuppeteerEngine...");
        try {
            // Wait for queue to become idle (all active tasks finished)
            await this.queue.onIdle();
            // Clear any pending tasks in the queue
            this.queue.clear();
            console.log("Task queue cleared.");
            // Clean up browser pool
            if (PuppeteerEngine.browserPool) {
                console.log("Cleaning up browser pool...");
                await PuppeteerEngine.browserPool.cleanup();
                PuppeteerEngine.browserPool = null; // Ensure pool is null after cleanup
                console.log("Browser pool cleaned up.");
            }
            else {
                console.log("Browser pool was already null.");
            }
        }
        catch (error) {
            console.error("Error during PuppeteerEngine cleanup:", error);
        }
    }
    getMetrics() {
        return PuppeteerEngine.browserPool?.getMetrics() || [];
    }
}
exports.PuppeteerEngine = PuppeteerEngine;
PuppeteerEngine.browserPool = null;
//# sourceMappingURL=PuppeteerEngine.js.map
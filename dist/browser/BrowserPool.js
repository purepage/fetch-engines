import { chromium } from "playwright";
// Puppeteer-extra and stealth plugin are removed as Playwright handles this differently or it's not directly needed.
export class BrowserPool {
    pool = [];
    maxBrowsers;
    maxPagesPerBrowser; // This might map to pages per context in Playwright
    maxBrowserAge; // Max age in ms
    healthCheckInterval; // Interval in ms
    healthCheckTimer;
    maxIdleTime = 5 * 60 * 1000; // 5 minutes idle timeout
    isCleaningUp = false; // Flag to prevent operations during cleanup
    constructor(maxBrowsers = 2, maxPagesPerBrowser = 4, // Revisit how this limit is applied with Playwright contexts
    maxBrowserAge = 30 * 60 * 1000, // 30 minutes
    healthCheckInterval = 30 * 1000 // 30 seconds
    ) {
        this.maxBrowsers = maxBrowsers;
        this.maxPagesPerBrowser = maxPagesPerBrowser;
        this.maxBrowserAge = maxBrowserAge;
        this.healthCheckInterval = healthCheckInterval;
        // Initialization moved to async initialize() method
    }
    // Create a Playwright Browser (using Chromium for now)
    async createBrowser() {
        console.log("Creating new Playwright browser instance (Chromium)...");
        // Map Puppeteer args to Playwright launch options where applicable
        const options = {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                // Playwright manages many flags automatically, fewer needed explicitly
                "--mute-audio",
                "--disable-background-networking",
                "--disable-background-timer-throttling",
                "--disable-breakpad",
                "--disable-client-side-phishing-detection",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-domain-reliability",
                "--disable-features=AudioServiceOutOfProcess",
                "--disable-hang-monitor",
                "--disable-ipc-flooding-protection",
                "--disable-notifications",
                "--disable-offer-store-unmasked-wallet-cards",
                "--disable-popup-blocking",
                "--disable-print-preview",
                "--disable-prompt-on-repost",
                "--disable-renderer-backgrounding",
                "--disable-sync",
                "--disable-translate",
                "--metrics-recording-only",
                "--no-default-browser-check",
                "--password-store=basic",
                "--use-mock-keychain",
            ],
            // Consider proxy settings, viewport, user agent etc. if needed
        };
        let browser;
        try {
            // Launch Chromium browser using Playwright
            browser = await chromium.launch(options);
        }
        catch (launchError) {
            console.error("Playwright launch failed:", launchError);
            throw launchError; // Re-throw after logging
        }
        // Create a default context for simplicity, could manage multiple contexts later
        const context = await browser.newContext();
        const instance = {
            browser,
            context, // Store the context
            metrics: {
                id: `playwright-${Date.now()}-${Math.random().toString(16).slice(2)}`, // Unique ID for Playwright
                pagesCreated: 0,
                activePages: 0,
                lastUsed: new Date(),
                errors: 0,
                totalRequests: 0,
                avgResponseTime: 0,
                createdAt: new Date(),
                isHealthy: true,
                engine: "playwright", // Identify engine as Playwright
            },
            isHealthy: true,
        };
        console.log(`Playwright browser instance created (ID: ${instance.metrics.id})`);
        // Handle disconnection gracefully using Playwright's event
        browser.on("disconnected", () => {
            console.warn(`Browser disconnected (ID: ${instance.metrics.id}), marking as unhealthy.`);
            instance.isHealthy = false;
            instance.metrics.isHealthy = false; // Ensure metric reflects state
            // Health check will handle removal
        });
        return instance;
    }
    // Close browser and its context
    async closeAndRemoveBrowser(instance) {
        if (!instance || this.isCleaningUp)
            return; // Prevent removal during cleanup
        console.log(`Closing and removing browser instance (ID: ${instance.metrics.id})`);
        // Remove from pool immediately to prevent reuse
        this.pool = this.pool.filter((b) => b !== instance);
        try {
            // Ensure context is closed before browser
            if (instance.context) {
                await instance.context.close();
            }
            await instance.browser.close();
            console.log(`Browser instance (ID: ${instance.metrics.id}) closed successfully.`);
        }
        catch (error) {
            console.error(`Error closing browser (ID: ${instance.metrics.id}):`, error);
            // Mark as unhealthy even if close fails, though it's already removed from pool
            instance.isHealthy = false;
            instance.metrics.isHealthy = false;
        }
        // Attempt to maintain pool size if not cleaning up
        if (!this.isCleaningUp && this.pool.length < this.maxBrowsers) {
            console.log("Attempting to create replacement browser...");
            this.ensureMinimumBrowsers().catch((err) => {
                console.error("Failed to ensure minimum browser count after removal:", err);
            });
        }
    }
    // Health check adapted for Playwright
    async healthCheck() {
        if (this.isCleaningUp)
            return; // Skip health check during cleanup
        console.log(`Running health check on ${this.pool.length} browser(s)...`);
        const now = Date.now();
        let browsersChanged = false;
        // Iterate backwards for safe removal
        for (let i = this.pool.length - 1; i >= 0; i--) {
            const instance = this.pool[i];
            let shouldRemove = false;
            let reason = "";
            // 1. Check browser age
            const browserAge = now - instance.metrics.createdAt.getTime();
            if (browserAge > this.maxBrowserAge) {
                shouldRemove = true;
                reason = "Browser max age exceeded";
            }
            // 2. Check idle time (only if pool size > 1)
            const idleTime = now - instance.metrics.lastUsed.getTime();
            // Check active pages using the context's pages
            const currentPages = instance.context?.pages() ?? [];
            instance.metrics.activePages = currentPages.length; // Update metric
            if (!shouldRemove && this.pool.length > 1 && instance.metrics.activePages === 0 && idleTime > this.maxIdleTime) {
                shouldRemove = true;
                reason = "Browser idle timeout exceeded";
            }
            // 3. Check explicit health status (e.g., disconnected event)
            if (!shouldRemove && !instance.isHealthy) {
                shouldRemove = true;
                reason = "Browser marked as unhealthy"; // Generic reason if already marked
            }
            // 4. Check responsiveness (using isConnected)
            if (!shouldRemove && instance.isHealthy) {
                try {
                    if (!instance.browser.isConnected()) {
                        shouldRemove = true;
                        reason = "Browser responsiveness check failed (not connected)";
                        instance.isHealthy = false; // Mark as unhealthy
                        instance.metrics.isHealthy = false;
                    }
                    else {
                        // Update active page count based on reality from the context
                        const pages = instance.context?.pages() ?? [];
                        instance.metrics.activePages = pages.length;
                        // Optionally add a more robust check like browser.version()
                        // await instance.browser.version();
                    }
                }
                catch (error) {
                    console.error(`Browser responsiveness check failed (ID: ${instance.metrics.id}):`, error);
                    shouldRemove = true;
                    reason = "Browser responsiveness check failed (error)";
                    instance.isHealthy = false; // Mark as unhealthy
                    instance.metrics.isHealthy = false;
                }
            }
            if (shouldRemove) {
                console.log(`${reason}. Removing browser (ID: ${instance.metrics.id}).`);
                // Use closeAndRemoveBrowser which handles removal from pool and closing
                this.closeAndRemoveBrowser(instance).catch((err) => console.error(`Error during async browser removal: ${err}`));
                browsersChanged = true;
            }
            else {
                // If not removed, ensure metric health status matches instance status
                instance.metrics.isHealthy = instance.isHealthy;
            }
        }
        // Ensure minimum browser count if changes occurred or pool is empty
        if (browsersChanged || this.pool.length === 0) {
            await this.ensureMinimumBrowsers();
        }
    }
    // ensureMinimumBrowsers remains largely the same, relies on createBrowser
    async ensureMinimumBrowsers() {
        if (this.isCleaningUp)
            return;
        // Ensure at least one, or half max browsers (configurable maybe?)
        const minBrowsers = Math.max(1, Math.floor(this.maxBrowsers / 2));
        const browsersNeeded = minBrowsers - this.pool.filter((b) => b.isHealthy).length;
        if (browsersNeeded > 0) {
            console.log(`Healthy browsers below minimum (${minBrowsers}), attempting to create ${browsersNeeded} browser(s)...`);
            for (let i = 0; i < browsersNeeded; i++) {
                if (this.pool.length >= this.maxBrowsers) {
                    console.log("Reached max browser limit during replenishment.");
                    break; // Stop if we hit the overall max
                }
                try {
                    const newInstance = await this.createBrowser();
                    this.pool.push(newInstance);
                }
                catch (error) {
                    console.error("Failed to create browser during pool replenishment:", error);
                    // Maybe add a delay before next attempt or stop trying after failures?
                    break; // Stop trying if one fails
                }
            }
        }
    }
    // startHealthChecks remains the same logic
    startHealthChecks() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer); // Clear existing timer if any - Cast to NodeJS.Timeout
        }
        console.log(`Starting browser pool health checks every ${this.healthCheckInterval / 1000} seconds.`);
        this.healthCheckTimer = setInterval(() => this.healthCheck().catch((err) => {
            console.error("Unhandled error in healthCheck:", err);
        }), this.healthCheckInterval);
        this.healthCheckTimer.unref(); // Allow Node.js process to exit if this is the only timer
    }
    /**
     * Asynchronously initializes the browser pool, creating the first browser instance
     * and starting health checks. Should be called before acquiring pages.
     */
    async initialize() {
        if (this.pool.length > 0 || this.isCleaningUp) {
            console.log("Browser pool already initialized or cleaning up.");
            return;
        }
        console.log("Initializing browser pool...");
        await this.ensureMinimumBrowsers(); // Create initial browser(s)
        this.startHealthChecks(); // Start checks after initial browser is created
        console.log("Browser pool initialized.");
    }
    // Acquire page adapted for Playwright using context
    async acquirePage() {
        if (this.isCleaningUp) {
            throw new Error("Cannot acquire page: Browser pool is cleaning up.");
        }
        // Find a healthy browser/context with capacity
        let targetInstance;
        // Prioritize instances with fewer pages
        const sortedPool = this.pool
            .filter((instance) => instance.isHealthy)
            .sort((a, b) => (a.context?.pages()?.length ?? Infinity) - (b.context?.pages()?.length ?? Infinity));
        for (const instance of sortedPool) {
            const currentPages = instance.context?.pages()?.length ?? Infinity;
            if (currentPages < this.maxPagesPerBrowser) {
                targetInstance = instance;
                break;
            }
        }
        // If no suitable browser/context found, and pool size is below max, try creating one
        if (!targetInstance && this.pool.length < this.maxBrowsers) {
            console.log("No available browser with capacity, attempting to create a new one...");
            try {
                const newInstance = await this.createBrowser();
                this.pool.push(newInstance);
                // Check if the new instance has capacity (should always be true initially)
                if ((newInstance.context?.pages()?.length ?? Infinity) < this.maxPagesPerBrowser) {
                    targetInstance = newInstance;
                }
                else {
                    console.warn("Newly created browser instance unexpectedly has no page capacity.");
                }
            }
            catch (error) {
                console.error("Failed to create new browser instance on demand:", error);
                // Fallback strategy if creation fails (optional): use least loaded regardless of limit
                if (!targetInstance && sortedPool.length > 0) {
                    targetInstance = sortedPool[0]; // Least loaded existing healthy one
                    console.warn(`Using potentially overloaded browser (ID: ${targetInstance.metrics.id}) as fallback after creation failure.`);
                }
            }
        }
        // If still no browser after all attempts
        if (!targetInstance || !targetInstance.context) {
            // Check context existence as well
            console.error("Failed to find or create a healthy browser instance with a valid context.");
            throw new Error("No healthy browsers/contexts available in the pool.");
        }
        try {
            const activePages = targetInstance.context.pages().length;
            console.log(`Acquiring page from browser (ID: ${targetInstance.metrics.id}, Active Pages: ${activePages})`);
            // Create page within the instance's context
            const page = await targetInstance.context.newPage();
            targetInstance.metrics.pagesCreated++;
            // Active page count will be updated by health check or can be done here
            targetInstance.metrics.activePages = targetInstance.context.pages().length;
            targetInstance.metrics.lastUsed = new Date(); // Update last used time
            // Track page close to potentially update metrics (less critical if health check does it)
            // Playwright pages emit 'close' event
            page.on("close", () => {
                try {
                    // Update metrics if the instance still exists in the pool
                    const instanceInPool = this.pool.find((inst) => inst === targetInstance);
                    if (instanceInPool && instanceInPool.context) {
                        instanceInPool.metrics.activePages = instanceInPool.context.pages().length;
                        // console.log(`Page closed event, browser active pages: ${instanceInPool.metrics.activePages} (ID: ${instanceInPool.metrics.id})`);
                    }
                }
                catch (e) {
                    // Ignore errors here, health check is the safety net
                    console.warn("Minor error updating metrics on page close event:", e);
                }
            });
            return page;
        }
        catch (error) {
            console.error(`Failed to create page in browser/context (ID: ${targetInstance.metrics.id}):`, error);
            targetInstance.metrics.errors++;
            // Mark browser as unhealthy if page creation fails
            targetInstance.isHealthy = false;
            targetInstance.metrics.isHealthy = false;
            this.healthCheck().catch((err) => console.error("Error running immediate health check after page fail:", err)); // Trigger health check
            throw new Error(`Failed to create page: ${error.message}`); // Re-throw
        }
    }
    // cleanup needs to close contexts as well
    async cleanup() {
        if (this.isCleaningUp)
            return; // Prevent concurrent cleanup
        this.isCleaningUp = true;
        console.log("Cleaning up browser pool...");
        // Stop health checks immediately
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer); // Cast to NodeJS.Timeout
            this.healthCheckTimer = undefined;
            console.log("Health checks stopped.");
        }
        // Create a copy of the pool to iterate over
        const browsersToClose = [...this.pool];
        console.log(`Closing ${browsersToClose.length} browser instance(s)...`);
        // Close browsers and their contexts concurrently
        await Promise.allSettled(browsersToClose.map(async (instance) => {
            try {
                // Ensure context is closed first if it exists
                if (instance.context) {
                    await instance.context.close();
                }
                await instance.browser.close();
            }
            catch (error) {
                console.error(`Error closing browser or context (ID: ${instance.metrics.id}) during cleanup:`, error);
            }
        }));
        this.pool = []; // Ensure pool is empty
        this.isCleaningUp = false;
        console.log("Browser pool cleanup complete.");
    }
    // getMetrics remains largely the same, ensure it reflects Playwright structure
    getMetrics() {
        // Return a deep copy of metrics to prevent external modification
        return this.pool.map((instance) => ({
            ...instance.metrics,
            // Ensure isHealthy and activePages are correctly sourced if not updated elsewhere
            isHealthy: instance.isHealthy,
            activePages: instance.context?.pages()?.length ?? instance.metrics.activePages ?? 0, // Get latest count from context if possible
        }));
    }
}
//# sourceMappingURL=BrowserPool.js.map
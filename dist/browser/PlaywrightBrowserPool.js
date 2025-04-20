// Import chromium directly from playwright
import { chromium as playwrightChromium } from "playwright";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue";
// Import addExtra from playwright-extra
import { addExtra } from "playwright-extra";
// Use 'any' for the wrapped chromium type to handle the added .use() method
let chromiumWithExtras;
let StealthPluginInstance; // Still need the stealth plugin instance
// Asynchronous function to load dependencies (now mainly for stealth plugin)
async function loadDependencies() {
    if (!chromiumWithExtras) {
        // Wrap the imported playwrightChromium using addExtra
        chromiumWithExtras = addExtra(playwrightChromium);
        // Dynamically import the stealth plugin module
        const StealthPluginModule = await import("puppeteer-extra-plugin-stealth");
        // Check if the default export exists and is a function, otherwise use the module itself
        const stealthPluginFactory = typeof StealthPluginModule.default === "function" ? StealthPluginModule.default : StealthPluginModule;
        // Ensure we have a callable factory
        if (typeof stealthPluginFactory !== "function") {
            throw new Error("puppeteer-extra-plugin-stealth export is not a function or module structure is unexpected.");
        }
        // Get the plugin instance
        StealthPluginInstance = stealthPluginFactory();
        // Apply the plugin instance to the wrapped chromium object
        chromiumWithExtras.use(StealthPluginInstance);
    }
}
/**
 * Manages a pool of Playwright Browser instances for efficient reuse.
 */
export class PlaywrightBrowserPool {
    pool = new Set();
    maxBrowsers;
    maxPagesPerContext;
    maxBrowserAge;
    healthCheckInterval;
    healthCheckTimer = null;
    maxIdleTime;
    isCleaningUp = false;
    useHeadedMode;
    blockedDomains;
    blockedResourceTypes;
    proxyConfig;
    static DEFAULT_BLOCKED_DOMAINS = [
        "doubleclick.net",
        "google-analytics.com",
        "googletagmanager.com",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "facebook.net",
        "fbcdn.net",
        "connect.facebook.net",
        "ads-twitter.com",
        "platform.twitter.com",
        "analytics.tiktok.com",
        "ads.tiktok.com",
        "amazon-adsystem.com",
        "adnxs.com",
        "criteo.com",
        "scorecardresearch.com",
        "quantserve.com",
        "rubiconproject.com",
        "pubmatic.com",
        "taboola.com",
        "outbrain.com",
    ];
    static DEFAULT_BLOCKED_RESOURCE_TYPES = ["image", "font", "media", "websocket"];
    acquireQueue = new PQueue({ concurrency: 1 });
    constructor(config = {}) {
        this.maxBrowsers = config.maxBrowsers ?? 2;
        this.maxPagesPerContext = config.maxPagesPerContext ?? 6;
        this.maxBrowserAge = config.maxBrowserAge ?? 20 * 60 * 1000;
        this.healthCheckInterval = config.healthCheckInterval ?? 60 * 1000;
        this.useHeadedMode = config.useHeadedMode ?? false;
        this.maxIdleTime = config.maxIdleTime ?? 5 * 60 * 1000;
        this.blockedDomains =
            config.blockedDomains && config.blockedDomains.length > 0
                ? config.blockedDomains
                : PlaywrightBrowserPool.DEFAULT_BLOCKED_DOMAINS;
        this.blockedResourceTypes =
            config.blockedResourceTypes && config.blockedResourceTypes.length > 0
                ? config.blockedResourceTypes
                : PlaywrightBrowserPool.DEFAULT_BLOCKED_RESOURCE_TYPES;
        this.proxyConfig = config.proxy;
    }
    async initialize() {
        await loadDependencies(); // Load dependencies first
        if (this.isCleaningUp)
            return;
        await this.ensureMinimumInstances();
        this.scheduleHealthCheck();
    }
    scheduleHealthCheck() {
        if (this.isCleaningUp)
            return;
        if (this.healthCheckTimer) {
            clearTimeout(this.healthCheckTimer);
        }
        if (this.healthCheckInterval > 0) {
            this.healthCheckTimer = setTimeout(() => {
                this.healthCheck().catch((_err) => {
                    /* Ignore health check errors */
                });
            }, this.healthCheckInterval);
        }
    }
    async ensureMinimumInstances() {
        if (this.isCleaningUp)
            return;
        while (this.pool.size < this.maxBrowsers) {
            try {
                await this.createBrowserInstance();
            }
            catch (error) {
                break;
            }
        }
    }
    async createBrowserInstance() {
        await loadDependencies(); // Ensure dependencies are loaded
        const id = uuidv4();
        const launchOptions = {
            headless: !this.useHeadedMode,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--mute-audio",
                "--disable-background-networking",
            ],
            proxy: this.proxyConfig,
        };
        // Use the wrapped chromiumWithExtras object to launch
        const browser = await chromiumWithExtras.launch(launchOptions);
        const context = await browser.newContext({
            userAgent: new UserAgent().toString(),
            viewport: {
                width: 1280 + Math.floor(Math.random() * 120),
                height: 720 + Math.floor(Math.random() * 80),
            },
            javaScriptEnabled: true,
            ignoreHTTPSErrors: true,
        });
        await context.route("**/*", async (route) => {
            const request = route.request();
            const url = request.url();
            const resourceType = request.resourceType();
            try {
                const hostname = new URL(url).hostname.toLowerCase();
                if (this.blockedDomains.some((domain) => hostname.includes(domain)) ||
                    this.blockedResourceTypes.includes(resourceType)) {
                    await route.abort("aborted");
                }
                else {
                    await route.continue();
                }
            }
            catch (_e) {
                await route.continue();
            }
        });
        const now = new Date();
        const metrics = {
            id,
            pagesCreated: 0,
            activePages: 0,
            lastUsed: now,
            errors: 0,
            createdAt: now,
            isHealthy: true,
        };
        const instance = {
            id,
            browser,
            context,
            pages: new Set(),
            metrics,
            isHealthy: true,
            disconnectedHandler: () => { },
        };
        instance.disconnectedHandler = () => {
            if (instance.isHealthy) {
                instance.isHealthy = false;
                instance.metrics.isHealthy = false;
                this.healthCheck().catch((_err) => { });
            }
        };
        browser.on("disconnected", instance.disconnectedHandler);
        this.pool.add(instance);
        return instance;
    }
    acquirePage() {
        return this.acquireQueue.add(async () => {
            if (this.isCleaningUp) {
                throw new Error("Pool is shutting down.");
            }
            let bestInstance = null;
            for (const instance of this.pool) {
                if (instance.isHealthy && instance.pages.size < this.maxPagesPerContext) {
                    if (!bestInstance || instance.pages.size < bestInstance.pages.size) {
                        bestInstance = instance;
                    }
                }
            }
            if (!bestInstance && this.pool.size < this.maxBrowsers) {
                try {
                    bestInstance = await this.createBrowserInstance();
                }
                catch (error) {
                    throw new Error(`Failed to create new browser instance for acquisition: ${error.message}`);
                }
            }
            if (!bestInstance) {
                await this.ensureMinimumInstances(); // Try adding an instance if none suitable
                for (const instance of this.pool) {
                    // Check again
                    if (instance.isHealthy && instance.pages.size < this.maxPagesPerContext) {
                        if (!bestInstance || instance.pages.size < bestInstance.pages.size) {
                            bestInstance = instance;
                        }
                    }
                }
                if (!bestInstance) {
                    // Still no instance?
                    throw new Error("Failed to acquire Playwright page: No available or creatable browser instance.");
                }
            }
            try {
                const page = await bestInstance.context.newPage();
                bestInstance.pages.add(page);
                bestInstance.metrics.pagesCreated++;
                bestInstance.metrics.activePages = bestInstance.pages.size;
                bestInstance.metrics.lastUsed = new Date();
                page.on("close", () => {
                    bestInstance.pages.delete(page);
                    bestInstance.metrics.activePages = bestInstance.pages.size;
                    bestInstance.metrics.lastUsed = new Date();
                });
                page.on("crash", () => {
                    bestInstance.metrics.errors++;
                    bestInstance.pages.delete(page);
                    bestInstance.isHealthy = false;
                    bestInstance.metrics.isHealthy = false;
                    this.healthCheck().catch((_err) => { });
                });
                return page;
            }
            catch (error) {
                bestInstance.metrics.errors++;
                bestInstance.isHealthy = false;
                bestInstance.metrics.isHealthy = false;
                this.healthCheck().catch((_err) => { });
                throw new Error(`Failed to create new page: ${error.message}`);
            }
        });
    }
    async healthCheck() {
        if (this.isCleaningUp)
            return;
        const now = new Date();
        const checks = [];
        for (const instance of this.pool) {
            checks.push((async () => {
                if (!instance.isHealthy) {
                    return;
                }
                let shouldRemove = false;
                let reason = "unknown";
                if (!instance.browser.isConnected()) {
                    shouldRemove = true;
                    reason = "browser disconnected";
                }
                if (!shouldRemove &&
                    this.maxBrowserAge > 0 &&
                    now.getTime() - instance.metrics.createdAt.getTime() > this.maxBrowserAge) {
                    shouldRemove = true;
                    reason = "max age reached";
                }
                if (!shouldRemove &&
                    this.pool.size > 1 && // Only remove idle if pool has more than 1
                    instance.pages.size === 0 &&
                    this.maxIdleTime > 0 &&
                    now.getTime() - instance.metrics.lastUsed.getTime() > this.maxIdleTime) {
                    shouldRemove = true;
                    reason = "idle timeout";
                }
                if (shouldRemove) {
                    instance.isHealthy = false;
                    instance.metrics.isHealthy = false;
                    await this.closeAndRemoveInstance(instance, reason);
                }
                else {
                    instance.isHealthy = true;
                    instance.metrics.isHealthy = true;
                }
            })().catch((_err) => { }));
        }
        try {
            await Promise.allSettled(checks);
        }
        finally {
            await this.ensureMinimumInstances(); // Ensure minimum instances after check
            this.scheduleHealthCheck();
        }
    }
    async closeAndRemoveInstance(instance, _reason) {
        const removed = this.pool.delete(instance);
        if (!removed)
            return;
        instance.browser.off("disconnected", instance.disconnectedHandler);
        try {
            await instance.context.close();
        }
        catch (_error) { }
        try {
            await instance.browser.close();
        }
        catch (_error) { }
    }
    async releasePage(page) {
        if (!page || page.isClosed())
            return;
        let ownerInstance;
        for (const instance of this.pool) {
            if (instance.pages.has(page)) {
                ownerInstance = instance;
                break;
            }
        }
        try {
            await page.close();
            if (ownerInstance) {
                ownerInstance.pages.delete(page);
                ownerInstance.metrics.activePages = ownerInstance.pages.size;
                ownerInstance.metrics.lastUsed = new Date();
            }
        }
        catch (error) {
            if (ownerInstance) {
                ownerInstance.isHealthy = false;
                ownerInstance.metrics.isHealthy = false;
                ownerInstance.metrics.errors++;
                ownerInstance.pages.delete(page);
                ownerInstance.metrics.activePages = ownerInstance.pages.size;
            }
        }
    }
    async cleanup() {
        if (this.isCleaningUp)
            return;
        this.isCleaningUp = true;
        if (this.healthCheckTimer) {
            clearTimeout(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        this.acquireQueue.clear();
        await this.acquireQueue.onIdle();
        const closePromises = [...this.pool].map((instance) => this.closeAndRemoveInstance(instance, "cleanup"));
        this.pool.clear();
        await Promise.allSettled(closePromises);
        this.isCleaningUp = false;
    }
    getMetrics() {
        return [...this.pool].map((instance) => ({
            ...instance.metrics,
            activePages: instance.pages.size,
            isHealthy: instance.isHealthy,
        }));
    }
}
//# sourceMappingURL=PlaywrightBrowserPool.js.map
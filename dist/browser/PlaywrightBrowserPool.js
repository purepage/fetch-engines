// Import chromium directly from playwright
import { chromium as playwrightChromiumLauncher, } from "playwright";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Import addExtra from playwright-extra
import { addExtra } from "playwright-extra";
let augmentedLauncher;
let stealthPlugin;
// Asynchronous function to load dependencies (now mainly for stealth plugin)
async function loadDependencies() {
    if (!augmentedLauncher) {
        // addExtra takes the original launcher and returns an augmented version.
        // The original playwrightChromiumLauncher is of type BrowserType<ChromiumBrowser>.
        // addExtra itself doesn't change this base type in a way TS immediately understands for .use,
        // so we cast after applying the plugin.
        const tempLauncher = addExtra(playwrightChromiumLauncher);
        stealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default();
        tempLauncher.use(stealthPlugin); // Apply plugin
        augmentedLauncher = tempLauncher; // Cast to our augmented type
    }
}
async function loadPatchrightLauncher() {
    const { chromium } = await import("patchright");
    return chromium;
}
// Define structure for browser instance managed by this pool -- THIS INTERFACE IS NO LONGER USED AND CAN BE REMOVED
/*
interface PlaywrightBrowserInstance {
  id: string;
  browser: PlaywrightBrowserType;
  context: BrowserContext;
  pages: Set<Page>;
  metrics: BrowserMetrics;
  isHealthy: boolean;
  disconnectedHandler: () => void;
}
*/
class ManagedBrowserInstance {
    id;
    browser;
    context;
    pages = new Set();
    metrics;
    isHealthy = true;
    disconnectedHandler;
    useHeadedMode;
    blockedDomains;
    blockedResourceTypes;
    proxyConfig;
    onDisconnect;
    launchOptions;
    cdpEndpoint;
    cdpConnectionOptions;
    browserDriver;
    connectedOverCDP;
    persistentUserDataDir;
    constructor(config) {
        this.id = uuidv4();
        this.useHeadedMode = config.useHeadedMode;
        this.blockedDomains = config.blockedDomains;
        this.blockedResourceTypes = config.blockedResourceTypes;
        this.proxyConfig = config.proxyConfig;
        this.onDisconnect = config.onDisconnect;
        this.launchOptions = config.launchOptions;
        this.cdpEndpoint = config.cdpEndpoint;
        this.cdpConnectionOptions = config.cdpConnectionOptions;
        this.browserDriver = config.browserDriver;
        this.connectedOverCDP = Boolean(config.cdpEndpoint);
        const now = new Date();
        this.metrics = {
            id: this.id,
            pagesCreated: 0,
            activePages: 0,
            lastUsed: now,
            errors: 0,
            createdAt: now,
            isHealthy: true,
        };
    }
    async initialize() {
        const defaultLaunchArgs = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--mute-audio",
            "--disable-background-networking",
        ];
        // Patchright already adjusts Chromium's launch flags, so avoid adding the
        // standard pool's automation-oriented defaults on that path.
        const mergedLaunchOptions = this.browserDriver === "patchright"
            ? {
                headless: !this.useHeadedMode,
                proxy: this.proxyConfig,
                ...this.launchOptions,
            }
            : {
                headless: !this.useHeadedMode,
                args: [...defaultLaunchArgs],
                proxy: this.proxyConfig,
                ...this.launchOptions,
            };
        // If user-provided launchOptions include args, ensure they are merged, not just replaced.
        // User args should ideally be additive or replace specific conflicting args intelligently.
        // For simplicity, we'll concatenate and de-duplicate, giving preference to user args for duplicates if any.
        if (this.browserDriver === "playwright" && this.launchOptions?.args) {
            mergedLaunchOptions.args = Array.from(new Set([...defaultLaunchArgs, ...this.launchOptions.args]));
        }
        // Explicitly set headless from this.launchOptions if provided, otherwise default based on this.useHeadedMode
        if (this.launchOptions && typeof this.launchOptions.headless === "boolean") {
            mergedLaunchOptions.headless = this.launchOptions.headless;
        }
        const directLauncher = this.browserDriver === "patchright" ? await loadPatchrightLauncher() : playwrightChromiumLauncher;
        if (this.cdpEndpoint) {
            this.browser = await directLauncher.connectOverCDP(this.cdpEndpoint, this.cdpConnectionOptions);
            const defaultContext = this.browser.contexts()[0];
            if (!defaultContext) {
                throw new Error("The CDP browser did not expose a default context.");
            }
            this.context = defaultContext;
        }
        else {
            if (this.browserDriver === "playwright") {
                await loadDependencies();
            }
            const launchDriver = this.browserDriver === "patchright" ? directLauncher : augmentedLauncher;
            if (this.browserDriver === "patchright") {
                this.persistentUserDataDir = await mkdtemp(join(tmpdir(), "purepage-patchright-"));
                const persistentOptions = {
                    ...mergedLaunchOptions,
                    viewport: null,
                    ignoreHTTPSErrors: true,
                };
                this.context = await launchDriver.launchPersistentContext(this.persistentUserDataDir, persistentOptions);
                const persistentBrowser = this.context.browser();
                if (!persistentBrowser) {
                    throw new Error("The Patchright persistent context did not expose its browser.");
                }
                this.browser = persistentBrowser;
            }
            else {
                this.browser = await launchDriver.launch(mergedLaunchOptions);
                this.context = await this.browser.newContext({
                    userAgent: new UserAgent().toString(),
                    viewport: {
                        width: 1280 + Math.floor(Math.random() * 120),
                        height: 720 + Math.floor(Math.random() * 80),
                    },
                    javaScriptEnabled: true,
                    ignoreHTTPSErrors: true,
                });
            }
        }
        if (this.browserDriver === "playwright") {
            await this.context.route("**/*", (route) => this.routeRequest(route));
        }
        this.disconnectedHandler = () => {
            if (this.isHealthy) {
                this.isHealthy = false;
                this.metrics.isHealthy = false;
                console.warn(`ManagedBrowserInstance ${this.id} disconnected unexpectedly.`);
                this.onDisconnect(this.id); // Notify pool
            }
        };
        this.browser.on("disconnected", this.disconnectedHandler);
        this.isHealthy = true; // Mark as healthy after successful initialization
    }
    async routeRequest(route) {
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
        catch (routeError) {
            const message = routeError instanceof Error ? routeError.message : String(routeError);
            console.debug(`Error in ManagedBrowserInstance (${this.id}) route interceptor for URL ${url}: ${message}. Request continued.`, routeError instanceof Error ? routeError : undefined);
            await route.continue();
        }
    }
    canCreateMorePages(maxPagesPerContext) {
        return this.isHealthy && this.pages.size < maxPagesPerContext;
    }
    async acquirePage() {
        if (!this.isHealthy) {
            throw new Error(`Browser instance ${this.id} is not healthy.`);
        }
        try {
            const reusableBlankPage = this.connectedOverCDP
                ? this.context.pages().find((candidate) => candidate.url() === "about:blank" && !this.pages.has(candidate))
                : undefined;
            const page = reusableBlankPage || (await this.context.newPage());
            this.pages.add(page);
            this.metrics.pagesCreated++;
            this.metrics.activePages = this.pages.size;
            this.metrics.lastUsed = new Date();
            page.on("close", () => {
                this.pages.delete(page);
                this.metrics.activePages = this.pages.size;
                this.metrics.lastUsed = new Date();
            });
            page.on("crash", () => {
                if (!this.isHealthy)
                    return;
                console.warn(`Page crashed in instance ${this.id}, URL: ${page.url()}`);
                this.metrics.errors++;
                this.pages.delete(page); // Remove from active pages
                this.metrics.activePages = this.pages.size;
                this.isHealthy = false; // Mark instance as unhealthy due to page crash
                this.metrics.isHealthy = false;
                this.onDisconnect(this.id); // Trigger pool's handling for unhealthy instance
            });
            return page;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Failed to create new page in instance ${this.id}: ${message}`, error);
            this.metrics.errors++;
            this.isHealthy = false;
            this.metrics.isHealthy = false;
            this.onDisconnect(this.id);
            throw new Error(`Failed to create new page in instance ${this.id}: ${message}`);
        }
    }
    async releasePage(page) {
        if (!this.pages.has(page))
            return;
        if (!page.isClosed()) {
            try {
                await page.close();
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Error closing page in instance ${this.id}: ${message}`, error);
                this.metrics.errors++;
                // If page close fails, instance might still be usable, but flag it as potentially problematic
                // Consider if this should mark instance unhealthy immediately
            }
        }
        this.pages.delete(page);
        this.metrics.activePages = this.pages.size;
        this.metrics.lastUsed = new Date();
    }
    checkHealth(now, maxBrowserAgeMs, maxIdleTimeMs) {
        if (!this.isHealthy) {
            return { shouldRemove: true, reason: "already marked unhealthy" };
        }
        if (!this.browser.isConnected()) {
            this.isHealthy = false;
            this.metrics.isHealthy = false;
            return { shouldRemove: true, reason: "browser disconnected" };
        }
        if (!this.connectedOverCDP &&
            maxBrowserAgeMs > 0 &&
            now.getTime() - this.metrics.createdAt.getTime() > maxBrowserAgeMs) {
            return { shouldRemove: true, reason: "max age reached" };
        }
        if (!this.connectedOverCDP &&
            this.pages.size === 0 &&
            maxIdleTimeMs > 0 &&
            now.getTime() - this.metrics.lastUsed.getTime() > maxIdleTimeMs) {
            return { shouldRemove: true, reason: "idle timeout" };
        }
        return { shouldRemove: false, reason: "" };
    }
    async close(reason) {
        this.isHealthy = false;
        this.metrics.isHealthy = false;
        console.log(`Closing browser instance ${this.id}, reason: ${reason || "cleanup"}`);
        if (this.browser) {
            if (this.disconnectedHandler) {
                this.browser.off("disconnected", this.disconnectedHandler);
            }
            await Promise.allSettled(Array.from(this.pages).map((page) => this.releasePage(page)));
            this.pages.clear();
            let contextClosed = false;
            if (!this.connectedOverCDP && this.context) {
                try {
                    await this.context.close();
                    contextClosed = true;
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`Error closing context for instance ${this.id}: ${message}`, error);
                }
            }
            if (!this.persistentUserDataDir || !contextClosed) {
                try {
                    await this.browser.close();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.warn(`Error closing browser for instance ${this.id}: ${message}`, error);
                }
            }
        }
        if (this.persistentUserDataDir) {
            try {
                await rm(this.persistentUserDataDir, { recursive: true, force: true });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Error removing Patchright profile ${this.persistentUserDataDir}: ${message}`);
            }
            finally {
                this.persistentUserDataDir = undefined;
            }
        }
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
    launchOptions;
    cdpEndpoint;
    cdpConnectionOptions;
    browserDriver;
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
    // The acquireQueue is used to serialize all page acquisition requests.
    // With concurrency: 1, it ensures that operations for finding/creating browser instances
    // and then acquiring a page from an instance are processed one at a time.
    // This prevents race conditions when checking pool capacity, creating new browser instances,
    // or selecting an instance from the pool, thus maintaining a consistent state for the pool.
    acquireQueue = new PQueue({ concurrency: 1 });
    pendingRecoveryInstances = new Set();
    recoveryBarrier = null;
    constructor(config = {}) {
        this.maxBrowsers = config.cdpEndpoint ? 1 : (config.maxBrowsers ?? 2);
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
        this.launchOptions = config.launchOptions;
        this.cdpEndpoint = config.cdpEndpoint;
        this.cdpConnectionOptions = config.cdpConnectionOptions;
        this.browserDriver = config.browserDriver ?? "playwright";
    }
    async initialize() {
        if (this.browserDriver === "playwright" && !this.cdpEndpoint) {
            await loadDependencies();
        }
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
                this.healthCheck().catch((err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    console.warn(`Scheduled PlaywrightBrowserPool health check process encountered an error: ${message}`, err instanceof Error ? err : undefined);
                });
            }, this.healthCheckInterval);
        }
    }
    async ensureMinimumInstances() {
        if (this.isCleaningUp)
            return;
        let initializationError;
        while (this.pool.size < this.maxBrowsers) {
            try {
                await this.createBrowserInstance();
            }
            catch (error) {
                initializationError = error;
                break;
            }
        }
        if (this.pool.size === 0 && initializationError) {
            throw initializationError;
        }
    }
    async createBrowserInstance() {
        if (this.browserDriver === "playwright" && !this.cdpEndpoint) {
            await loadDependencies();
        }
        const instance = new ManagedBrowserInstance({
            useHeadedMode: this.useHeadedMode,
            blockedDomains: this.blockedDomains,
            blockedResourceTypes: this.blockedResourceTypes,
            proxyConfig: this.proxyConfig,
            launchOptions: this.launchOptions,
            cdpEndpoint: this.cdpEndpoint,
            cdpConnectionOptions: this.cdpConnectionOptions,
            browserDriver: this.browserDriver,
            onDisconnect: (instanceId) => {
                this.handleUnexpectedDisconnect(instanceId);
            },
        });
        try {
            await instance.initialize();
        }
        catch (error) {
            await instance.close("initialization failed");
            throw error;
        }
        this.pool.add(instance);
        return instance;
    }
    handleUnexpectedDisconnect(instanceId) {
        if (this.isCleaningUp)
            return;
        const instanceToRemove = [...this.pool].find((instance) => instance.id === instanceId);
        if (!instanceToRemove)
            return;
        // Release pool capacity before queued acquisitions get a chance to inspect
        // it. The recovery barrier below keeps those acquisitions from racing the
        // asynchronous close and replacement.
        this.pool.delete(instanceToRemove);
        this.pendingRecoveryInstances.add(instanceToRemove);
        console.warn(`Removed disconnected instance ${instanceId} from pool.`);
        this.startRecovery();
    }
    startRecovery() {
        if (this.recoveryBarrier)
            return;
        const recovery = this.recoverDisconnectedInstances().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error recovering disconnected browser instances: ${message}`, error);
        });
        this.recoveryBarrier = recovery;
        void recovery.then(() => {
            if (this.recoveryBarrier !== recovery)
                return;
            this.recoveryBarrier = null;
            if (this.pendingRecoveryInstances.size > 0) {
                this.startRecovery();
            }
        });
    }
    async recoverDisconnectedInstances() {
        while (this.pendingRecoveryInstances.size > 0) {
            const instancesToClose = [...this.pendingRecoveryInstances];
            this.pendingRecoveryInstances.clear();
            await Promise.allSettled(instancesToClose.map((instance) => instance.close(`instance ${instance.id} disconnected`)));
        }
        if (!this.isCleaningUp) {
            await this.ensureMinimumInstances();
        }
    }
    async waitForRecovery() {
        while (this.recoveryBarrier) {
            await this.recoveryBarrier;
        }
    }
    acquirePage() {
        return this.acquireQueue.add(async () => {
            await this.waitForRecovery();
            if (this.isCleaningUp) {
                throw new Error("Pool is shutting down.");
            }
            let bestInstance = null;
            // Try to find an existing healthy instance that can create more pages
            for (const instance of this.pool) {
                if (instance.canCreateMorePages(this.maxPagesPerContext)) {
                    if (!bestInstance || instance.pages.size < bestInstance.pages.size) {
                        bestInstance = instance;
                    }
                }
            }
            // If no suitable existing instance, and pool is not full, try to create a new one
            if (!bestInstance && this.pool.size < this.maxBrowsers) {
                try {
                    bestInstance = await this.createBrowserInstance();
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error(`Failed to create new browser instance during page acquisition: ${message}`, error);
                    // Don't re-throw immediately, try checking existing pool members again in case one became available
                }
            }
            // If still no instance (either creation failed or pool was full and no suitable instance found), re-check pool
            // This also covers the case where createBrowserInstance succeeded and bestInstance is now set.
            if (!bestInstance) {
                for (const instance of this.pool) {
                    if (instance.canCreateMorePages(this.maxPagesPerContext)) {
                        if (!bestInstance || instance.pages.size < bestInstance.pages.size) {
                            bestInstance = instance;
                        }
                    }
                }
            }
            if (!bestInstance) {
                // After all attempts, if still no instance, then throw.
                throw new Error("Failed to acquire Playwright page: No available or creatable healthy browser instance.");
            }
            // Now, bestInstance should be a valid ManagedBrowserInstance
            try {
                const page = await bestInstance.acquirePage();
                // page.on('close') and page.on('crash') are handled within ManagedBrowserInstance.acquirePage()
                return page;
            }
            catch (error) {
                // If page acquisition from the chosen instance fails, that instance would have marked itself unhealthy
                // and called onDisconnect, which triggers the pool to re-evaluate. We should throw here.
                const message = error instanceof Error ? error.message : String(error);
                console.error(`Failed to acquire page from instance ${bestInstance.id} (it might have become unhealthy): ${message}`, error);
                throw new Error(`Failed to acquire page from instance ${bestInstance.id}: ${message}`); // Re-throw to signal failure to the caller
            }
        });
    }
    async healthCheck() {
        if (this.isCleaningUp)
            return;
        const now = new Date();
        const instancesToRemove = [];
        for (const instance of this.pool) {
            const healthStatus = instance.checkHealth(now, this.maxBrowserAge, this.maxIdleTime);
            if (healthStatus.shouldRemove) {
                // Mark for removal, but don't modify the set while iterating
                instancesToRemove.push(instance);
                console.log(`Instance ${instance.id} marked for removal due to health check: ${healthStatus.reason}`);
            }
            else {
                // Ensure instance.isHealthy and metrics.isHealthy are up-to-date if checkHealth didn't mark for removal
                // (e.g. if it was previously unhealthy but now browser.isConnected() is true again - unlikely but good to be robust)
                instance.isHealthy = instance.browser.isConnected();
                instance.metrics.isHealthy = instance.isHealthy;
            }
        }
        // Close and remove unhealthy/aged/idle instances
        if (instancesToRemove.length > 0) {
            const removalPromises = instancesToRemove.map((instance) => this.closeAndRemoveInstance(instance, `health check: ${instance.metrics.id} failed`) // Using metrics.id in reason might be redundant
            );
            await Promise.allSettled(removalPromises);
        }
        try {
            await this.ensureMinimumInstances(); // Ensure minimum instances after potential removals
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Error ensuring minimum instances during health check: ${message}`, error);
        }
        this.scheduleHealthCheck(); // Reschedule the next health check
    }
    async closeAndRemoveInstance(instance, reason) {
        const removed = this.pool.delete(instance);
        if (!removed)
            return; // Instance was not in the pool or already removed
        // The ManagedBrowserInstance is responsible for its own internal cleanup, including listeners.
        await instance.close(reason);
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
        if (ownerInstance) {
            try {
                // ManagedBrowserInstance.releasePage will handle closing the page and updating its own metrics.
                await ownerInstance.releasePage(page);
            }
            catch (error) {
                // If releasePage in ManagedBrowserInstance itself throws (e.g., error during page.close()),
                // that method should handle marking the instance as unhealthy if necessary.
                // Log here for pool-level visibility.
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Error while instance ${ownerInstance.id} was releasing page: ${message}`, error);
                // The instance's own error handling (e.g. in acquirePage or crash handler) should trigger onDisconnect
                // if the instance becomes critically unhealthy.
            }
        }
        else {
            // Page not found in any managed instance, try to close it as a orphaned page.
            try {
                await page.close();
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Error closing an orphaned page (not found in any pool instance): ${message}`, error);
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
        await this.waitForRecovery();
        // Create a copy of the pool to iterate over, as closeAndRemoveInstance modifies the original set.
        const instancesToClose = Array.from(this.pool);
        const closePromises = instancesToClose.map((instance) => this.closeAndRemoveInstance(instance, "pool cleanup"));
        this.pool.clear(); // Clear the main pool set immediately
        await Promise.allSettled(closePromises);
        this.isCleaningUp = false;
    }
    getMetrics() {
        return [...this.pool].map((instance) => instance.metrics);
    }
}
//# sourceMappingURL=PlaywrightBrowserPool.js.map
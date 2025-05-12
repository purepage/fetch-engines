// Import chromium directly from playwright
import {
  chromium as playwrightChromiumLauncher,
  Browser as PlaywrightBrowserType,
  ChromiumBrowser as PlaywrightChromiumBrowserInstanceType,
  BrowserContext,
  Page,
  Route,
  LaunchOptions,
  BrowserType as PlaywrightBrowserLauncherType,
} from "playwright";
import type { BrowserMetrics } from "../types.js";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue";

// Import addExtra from playwright-extra
import { addExtra } from "playwright-extra";
// Import PuppeteerExtraPlugin type (base type for stealth plugin)
import type { PuppeteerExtraPlugin } from "puppeteer-extra-plugin";

// Interface to describe the augmented Chromium LAUNCHER from playwright-extra
// It extends the generic BrowserType launcher and adds the .use() method.
interface AugmentedChromiumLauncher extends PlaywrightBrowserLauncherType<PlaywrightChromiumBrowserInstanceType> {
  use(plugin: PuppeteerExtraPlugin): this;
}

let augmentedLauncher: AugmentedChromiumLauncher;
let stealthPlugin: PuppeteerExtraPlugin;

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
    augmentedLauncher = tempLauncher as AugmentedChromiumLauncher; // Cast to our augmented type
  }
}

// Define structure for browser instance managed by this pool
interface PlaywrightBrowserInstance {
  id: string;
  browser: PlaywrightBrowserType;
  context: BrowserContext;
  pages: Set<Page>;
  metrics: BrowserMetrics;
  isHealthy: boolean;
  disconnectedHandler: () => void;
}

class ManagedBrowserInstance {
  public readonly id: string;
  public browser!: PlaywrightBrowserType;
  public context!: BrowserContext;
  public readonly pages: Set<Page> = new Set();
  public readonly metrics: BrowserMetrics;
  public isHealthy: boolean = true;
  private disconnectedHandler!: () => void;

  private readonly useHeadedMode: boolean;
  private readonly blockedDomains: string[];
  private readonly blockedResourceTypes: string[];
  private readonly proxyConfig?: { server: string; username?: string; password?: string };
  private readonly onDisconnect: (instanceId: string) => void;

  constructor(config: {
    useHeadedMode: boolean;
    blockedDomains: string[];
    blockedResourceTypes: string[];
    proxyConfig?: { server: string; username?: string; password?: string };
    onDisconnect: (instanceId: string) => void; // Callback for when browser disconnects
  }) {
    this.id = uuidv4();
    this.useHeadedMode = config.useHeadedMode;
    this.blockedDomains = config.blockedDomains;
    this.blockedResourceTypes = config.blockedResourceTypes;
    this.proxyConfig = config.proxyConfig;
    this.onDisconnect = config.onDisconnect;

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

  async initialize(): Promise<void> {
    await loadDependencies(); // Ensure augmentedLauncher is ready

    const launchOptions: LaunchOptions = {
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

    this.browser = await augmentedLauncher.launch(launchOptions);
    this.context = await this.browser.newContext({
      userAgent: new UserAgent().toString(),
      viewport: {
        width: 1280 + Math.floor(Math.random() * 120),
        height: 720 + Math.floor(Math.random() * 80),
      },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    await this.context.route("**/*", async (route: Route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (
          this.blockedDomains.some((domain) => hostname.includes(domain)) ||
          this.blockedResourceTypes.includes(resourceType)
        ) {
          await route.abort("aborted");
        } else {
          await route.continue();
        }
      } catch (routeError: any) {
        console.debug(
          `Error in ManagedBrowserInstance (${this.id}) route interceptor for URL ${url}: ${routeError?.message}. Request continued.`,
          routeError
        );
        await route.continue();
      }
    });

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

  canCreateMorePages(maxPagesPerContext: number): boolean {
    return this.isHealthy && this.pages.size < maxPagesPerContext;
  }

  async acquirePage(): Promise<Page> {
    if (!this.isHealthy) {
      throw new Error(`Browser instance ${this.id} is not healthy.`);
    }
    try {
      const page = await this.context.newPage();
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
        console.warn(`Page crashed in instance ${this.id}, URL: ${page.url()}`);
        this.metrics.errors++;
        this.pages.delete(page); // Remove from active pages
        this.metrics.activePages = this.pages.size;
        this.isHealthy = false; // Mark instance as unhealthy due to page crash
        this.metrics.isHealthy = false;
        this.onDisconnect(this.id); // Trigger pool's handling for unhealthy instance
      });

      return page;
    } catch (error: any) {
      console.error(`Failed to create new page in instance ${this.id}: ${error.message}`, error);
      this.metrics.errors++;
      this.isHealthy = false;
      this.metrics.isHealthy = false;
      this.onDisconnect(this.id);
      throw new Error(`Failed to create new page in instance ${this.id}: ${error.message}`);
    }
  }

  async releasePage(page: Page): Promise<void> {
    if (this.pages.has(page) && !page.isClosed()) {
      try {
        await page.close();
      } catch (error: any) {
        console.warn(`Error closing page in instance ${this.id}: ${error.message}`, error);
        this.metrics.errors++;
        // If page close fails, instance might still be usable, but flag it as potentially problematic
        // Consider if this should mark instance unhealthy immediately
      }
    }
    // The page.on('close') handler will update metrics.pages and activePages
  }

  checkHealth(now: Date, maxBrowserAgeMs: number, maxIdleTimeMs: number): { shouldRemove: boolean; reason: string } {
    if (!this.isHealthy) {
      return { shouldRemove: true, reason: "already marked unhealthy" };
    }
    if (!this.browser.isConnected()) {
      this.isHealthy = false;
      this.metrics.isHealthy = false;
      return { shouldRemove: true, reason: "browser disconnected" };
    }
    if (maxBrowserAgeMs > 0 && now.getTime() - this.metrics.createdAt.getTime() > maxBrowserAgeMs) {
      return { shouldRemove: true, reason: "max age reached" };
    }
    if (this.pages.size === 0 && maxIdleTimeMs > 0 && now.getTime() - this.metrics.lastUsed.getTime() > maxIdleTimeMs) {
      return { shouldRemove: true, reason: "idle timeout" };
    }
    return { shouldRemove: false, reason: "" };
  }

  async close(reason?: string): Promise<void> {
    this.isHealthy = false;
    this.metrics.isHealthy = false;
    console.log(`Closing browser instance ${this.id}, reason: ${reason || "cleanup"}`);
    if (this.browser) {
      this.browser.off("disconnected", this.disconnectedHandler); // Important to remove listener
      try {
        await this.context.close();
      } catch (error: any) {
        console.warn(`Error closing context for instance ${this.id}: ${error.message}`, error);
      }
      try {
        await this.browser.close();
      } catch (error: any) {
        console.warn(`Error closing browser for instance ${this.id}: ${error.message}`, error);
      }
    }
  }
}

/**
 * Manages a pool of Playwright Browser instances for efficient reuse.
 */
export class PlaywrightBrowserPool {
  private pool: Set<ManagedBrowserInstance> = new Set();
  private readonly maxBrowsers: number;
  private readonly maxPagesPerContext: number;
  private readonly maxBrowserAge: number;
  private readonly healthCheckInterval: number;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly maxIdleTime: number;
  private isCleaningUp: boolean = false;
  private readonly useHeadedMode: boolean;
  private readonly blockedDomains: string[];
  private readonly blockedResourceTypes: string[];
  private readonly proxyConfig?: {
    server: string;
    username?: string;
    password?: string;
  };

  private static readonly DEFAULT_BLOCKED_DOMAINS: string[] = [
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
  private static readonly DEFAULT_BLOCKED_RESOURCE_TYPES = ["image", "font", "media", "websocket"];

  private readonly acquireQueue: PQueue = new PQueue({ concurrency: 1 });

  constructor(
    config: {
      maxBrowsers?: number;
      maxPagesPerContext?: number;
      maxBrowserAge?: number;
      healthCheckInterval?: number;
      useHeadedMode?: boolean;
      blockedDomains?: string[];
      blockedResourceTypes?: string[];
      proxy?: { server: string; username?: string; password?: string };
      maxIdleTime?: number;
    } = {}
  ) {
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

  public async initialize(): Promise<void> {
    await loadDependencies(); // Load dependencies first
    if (this.isCleaningUp) return;
    await this.ensureMinimumInstances();
    this.scheduleHealthCheck();
  }

  private scheduleHealthCheck(): void {
    if (this.isCleaningUp) return;
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
    }
    if (this.healthCheckInterval > 0) {
      this.healthCheckTimer = setTimeout(() => {
        this.healthCheck().catch((err: any) => {
          console.warn(
            `Scheduled PlaywrightBrowserPool health check process encountered an error: ${err?.message}`,
            err
          );
        });
      }, this.healthCheckInterval);
    }
  }

  private async ensureMinimumInstances(): Promise<void> {
    if (this.isCleaningUp) return;
    while (this.pool.size < this.maxBrowsers) {
      try {
        await this.createBrowserInstance();
      } catch (error) {
        break;
      }
    }
  }

  private async createBrowserInstance(): Promise<ManagedBrowserInstance> {
    await loadDependencies(); // Ensure dependencies are loaded
    const instance = new ManagedBrowserInstance({
      useHeadedMode: this.useHeadedMode,
      blockedDomains: this.blockedDomains,
      blockedResourceTypes: this.blockedResourceTypes,
      proxyConfig: this.proxyConfig,
      onDisconnect: (instanceId) => {
        // Find the instance by ID and remove it from the pool
        let instanceToRemove: ManagedBrowserInstance | undefined;
        for (const inst of this.pool) {
          if (inst.id === instanceId) {
            instanceToRemove = inst;
            break;
          }
        }
        if (instanceToRemove) {
          this.pool.delete(instanceToRemove);
          console.warn(`Removed disconnected instance ${instanceId} from pool.`);
          // Ensure minimum instances are maintained
          this.ensureMinimumInstances().catch((err) => {
            console.error(
              `Error ensuring minimum instances after removing disconnected instance ${instanceId}: ${err.message}`,
              err
            );
          });
        }
      },
    });
    await instance.initialize();
    this.pool.add(instance);
    return instance;
  }

  public acquirePage(): Promise<Page> {
    return this.acquireQueue.add(async () => {
      if (this.isCleaningUp) {
        throw new Error("Pool is shutting down.");
      }

      let bestInstance: ManagedBrowserInstance | null = null;

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
        } catch (error: any) {
          console.error(`Failed to create new browser instance during page acquisition: ${error.message}`, error);
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
      } catch (error: any) {
        // If page acquisition from the chosen instance fails, that instance would have marked itself unhealthy
        // and called onDisconnect, which triggers the pool to re-evaluate. We should throw here.
        console.error(
          `Failed to acquire page from instance ${bestInstance.id} (it might have become unhealthy): ${error.message}`,
          error
        );
        throw new Error(`Failed to acquire page from instance ${bestInstance.id}: ${error.message}`); // Re-throw to signal failure to the caller
      }
    }) as Promise<Page>;
  }

  private async healthCheck(): Promise<void> {
    if (this.isCleaningUp) return;

    const now = new Date();
    const instancesToRemove: ManagedBrowserInstance[] = [];

    for (const instance of this.pool) {
      const healthStatus = instance.checkHealth(now, this.maxBrowserAge, this.maxIdleTime);
      if (healthStatus.shouldRemove) {
        // Mark for removal, but don't modify the set while iterating
        instancesToRemove.push(instance);
        console.log(`Instance ${instance.id} marked for removal due to health check: ${healthStatus.reason}`);
      } else {
        // Ensure instance.isHealthy and metrics.isHealthy are up-to-date if checkHealth didn't mark for removal
        // (e.g. if it was previously unhealthy but now browser.isConnected() is true again - unlikely but good to be robust)
        instance.isHealthy = instance.browser.isConnected();
        instance.metrics.isHealthy = instance.isHealthy;
      }
    }

    // Close and remove unhealthy/aged/idle instances
    if (instancesToRemove.length > 0) {
      const removalPromises = instancesToRemove.map(
        (instance) => this.closeAndRemoveInstance(instance, `health check: ${instance.metrics.id} failed`) // Using metrics.id in reason might be redundant
      );
      await Promise.allSettled(removalPromises);
    }

    try {
      await this.ensureMinimumInstances(); // Ensure minimum instances after potential removals
    } catch (error: any) {
      console.error(`Error ensuring minimum instances during health check: ${error.message}`, error);
    }
    this.scheduleHealthCheck(); // Reschedule the next health check
  }

  private async closeAndRemoveInstance(instance: ManagedBrowserInstance, reason?: string): Promise<void> {
    const removed = this.pool.delete(instance);
    if (!removed) return; // Instance was not in the pool or already removed

    // The ManagedBrowserInstance is responsible for its own internal cleanup, including listeners.
    await instance.close(reason);
  }

  public async releasePage(page: Page): Promise<void> {
    if (!page || page.isClosed()) return;

    let ownerInstance: ManagedBrowserInstance | undefined;
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
      } catch (error: any) {
        // If releasePage in ManagedBrowserInstance itself throws (e.g., error during page.close()),
        // that method should handle marking the instance as unhealthy if necessary.
        // Log here for pool-level visibility.
        console.warn(`Error while instance ${ownerInstance.id} was releasing page: ${error.message}`, error);
        // The instance's own error handling (e.g. in acquirePage or crash handler) should trigger onDisconnect
        // if the instance becomes critically unhealthy.
      }
    } else {
      // Page not found in any managed instance, try to close it as a orphaned page.
      try {
        await page.close();
      } catch (error: any) {
        console.warn(`Error closing an orphaned page (not found in any pool instance): ${error.message}`, error);
      }
    }
  }

  public async cleanup(): Promise<void> {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.acquireQueue.clear();
    await this.acquireQueue.onIdle();

    // Create a copy of the pool to iterate over, as closeAndRemoveInstance modifies the original set.
    const instancesToClose = Array.from(this.pool);
    const closePromises = instancesToClose.map((instance) => this.closeAndRemoveInstance(instance, "pool cleanup"));

    this.pool.clear(); // Clear the main pool set immediately
    await Promise.allSettled(closePromises);
    this.isCleaningUp = false;
  }

  public getMetrics(): BrowserMetrics[] {
    return [...this.pool].map((instance) => instance.metrics);
  }
}

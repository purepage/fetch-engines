// Use playwright-extra via require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const playwrightExtra = require("playwright-extra");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// Import types from original playwright
import type {
  Browser,
  BrowserContext,
  Page,
  BrowserType,
  Route,
  LaunchOptions,
} from "playwright";
import type { BrowserMetrics } from "../types.js";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue"; // Restored
// REMOVED import EventEmitter from "events"; // Import EventEmitter
// Use require for CJS interop
// eslint-disable-next-line @typescript-eslint/no-var-requires
// const Debug = require("debug");
// import * as Debug from "debug"; // Changed back to import
// import Debug from "debug"; // Try default import

// Cast the required chromium object to the correct type
const chromium: BrowserType = playwrightExtra.chromium;

// Apply stealth plugin - cast to any to access .use()
(chromium as any).use(StealthPlugin());

// Define structure for browser instance managed by this pool
interface PlaywrightBrowserInstance {
  id: string;
  browser: Browser;
  context: BrowserContext; // Store the context
  pages: Set<Page>; // Track pages per context/browser
  metrics: BrowserMetrics; // Use the exported type
  isHealthy: boolean;
  disconnectedHandler: () => void; // Store handler for removal
}

/**
 * Manages a pool of Playwright Browser instances for efficient reuse.
 */
export class PlaywrightBrowserPool {
  private pool: Set<PlaywrightBrowserInstance> = new Set();
  private readonly maxBrowsers: number;
  private readonly maxPagesPerContext: number; // Renamed from maxPagesPerBrowser for clarity
  private readonly maxBrowserAge: number; // Max age in ms
  private readonly healthCheckInterval: number; // Interval in ms
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly maxIdleTime: number = 5 * 60 * 1000; // 5 minutes idle timeout
  private isCleaningUp: boolean = false; // Flag to prevent operations during cleanup
  private readonly useHeadedMode: boolean; // Store mode for reference
  // Store blocking lists as instance properties
  private readonly blockedDomains: string[];
  private readonly blockedResourceTypes: string[];
  // Add proxyConfig property
  private readonly proxyConfig?: {
    server: string;
    username?: string;
    password?: string;
  };

  // Define defaults statically
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
    // Add more domains as needed
  ];
  private static readonly DEFAULT_BLOCKED_RESOURCE_TYPES = [
    "image", // Keep image blocked by default
    "font",
    "media",
    "websocket",
    // Removed stylesheet - essential for layout
    // Removed script - essential for functionality
  ];

  private readonly acquireQueue: PQueue = new PQueue({ concurrency: 1 }); // Queue for acquiring pages

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
      maxIdleTime?: number; // Added maxIdleTime
    } = {},
  ) {
    this.maxBrowsers = config.maxBrowsers ?? 2;
    this.maxPagesPerContext = config.maxPagesPerContext ?? 6;
    this.maxBrowserAge = config.maxBrowserAge ?? 20 * 60 * 1000;
    this.healthCheckInterval = config.healthCheckInterval ?? 60 * 1000;
    this.useHeadedMode = config.useHeadedMode ?? false;
    this.maxIdleTime = config.maxIdleTime ?? 5 * 60 * 1000;
    // Use provided lists or defaults
    this.blockedDomains =
      config.blockedDomains && config.blockedDomains.length > 0
        ? config.blockedDomains
        : PlaywrightBrowserPool.DEFAULT_BLOCKED_DOMAINS;
    this.blockedResourceTypes =
      config.blockedResourceTypes && config.blockedResourceTypes.length > 0
        ? config.blockedResourceTypes
        : PlaywrightBrowserPool.DEFAULT_BLOCKED_RESOURCE_TYPES;
    // Store proxy config (will be undefined if not provided)
    this.proxyConfig = config.proxy;
  }

  /**
   * Initializes the pool and starts health checks.
   */
  public async initialize(): Promise<void> {
    if (this.isCleaningUp) return;
    await this.ensureMinimumInstances();
    this.scheduleHealthCheck(); // Now defined
  }

  /**
   * Schedules the next health check.
   */
  private scheduleHealthCheck(): void {
    if (this.isCleaningUp) return;
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

  /**
   * Ensures the pool has the configured maximum number of browser instances.
   */
  private async ensureMinimumInstances(): Promise<void> {
    if (this.isCleaningUp) return;
    // Use a loop that checks size correctly
    while (this.pool.size < this.maxBrowsers) {
      try {
        await this.createBrowserInstance();
      } catch (error) {
        // Log error creating instance?
        break; // Stop if instance creation fails
      }
    }
  }

  /**
   * Creates a new Playwright Browser instance and adds it to the pool.
   */
  private async createBrowserInstance(): Promise<PlaywrightBrowserInstance> {
    const id = uuidv4(); // Correct usage
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

    const chromium = playwrightExtra.chromium as BrowserType;
    try {
      (chromium as any).use(StealthPlugin());
    } catch (_e) {
      /* Ignore stealth plugin errors */
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      userAgent: new UserAgent().toString(),
      viewport: {
        width: 1280 + Math.floor(Math.random() * 120),
        height: 720 + Math.floor(Math.random() * 80),
      }, // Slightly randomized viewport
      javaScriptEnabled: true,
      // bypassCSP: true, // Use with caution, can break sites
      ignoreHTTPSErrors: true, // Useful for some sites, but less secure
      // locale: 'en-US', // Set locale if needed
      // timezoneId: 'America/New_York', // Set timezone if needed
    });

    // Apply blocking rules to the context
    await context.route("**/*", async (route: Route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (
          this.blockedDomains.some((domain) => hostname.includes(domain)) ||
          this.blockedResourceTypes.includes(resourceType)
        ) {
          await route.abort();
        } else {
          await route.continue();
        }
      } catch (_e) {
        await route.continue(); // Continue on URL parse errors
      }
    });

    const now = new Date();
    const metrics: BrowserMetrics = {
      id,
      pagesCreated: 0,
      activePages: 0,
      lastUsed: now,
      errors: 0,
      createdAt: now,
      isHealthy: true,
    };

    const instance: PlaywrightBrowserInstance = {
      id,
      browser,
      context,
      pages: new Set(),
      metrics,
      isHealthy: true,
      disconnectedHandler: () => {}, // Initialize with placeholder
    };

    // Define and attach the disconnect handler
    instance.disconnectedHandler = () => {
      if (instance.isHealthy) {
        // Prevent multiple calls
        instance.isHealthy = false;
        instance.metrics.isHealthy = false;
        this.healthCheck().catch((_err) => {}); // Trigger health check immediately
      }
    };
    browser.on("disconnected", instance.disconnectedHandler);

    this.pool.add(instance); // Use Set.add
    return instance;
  }

  /**
   * Acquires a Page from a healthy browser instance in the pool.
   */
  public acquirePage(): Promise<Page> {
    // Use the acquisition queue
    return this.acquireQueue.add(async () => {
      if (this.isCleaningUp) {
        throw new Error("Pool is shutting down.");
      }

      let bestInstance: PlaywrightBrowserInstance | null = null;
      for (const instance of this.pool) {
        if (
          instance.isHealthy &&
          instance.pages.size < this.maxPagesPerContext
        ) {
          if (!bestInstance || instance.pages.size < bestInstance.pages.size) {
            bestInstance = instance;
          }
        }
      }

      if (!bestInstance && this.pool.size < this.maxBrowsers) {
        try {
          bestInstance = await this.createBrowserInstance();
        } catch (error) {
          throw new Error(
            `Failed to create new browser instance for acquisition: ${(error as Error).message}`,
          );
        }
      }

      if (!bestInstance) {
        throw new Error(
          "Failed to acquire Playwright page: No available browser instance.",
        );
      }

      try {
        const page = await bestInstance.context.newPage();
        bestInstance.pages.add(page);
        bestInstance.metrics.pagesCreated++;
        bestInstance.metrics.activePages = bestInstance.pages.size;
        bestInstance.metrics.lastUsed = new Date();

        // Add handlers within try block
        page.on("close", () => {
          bestInstance.pages.delete(page);
          bestInstance.metrics.activePages = bestInstance.pages.size;
          bestInstance.metrics.lastUsed = new Date();
        });
        page.on("crash", () => {
          bestInstance.metrics.errors++;
          bestInstance.pages.delete(page); // Remove crashed page
          bestInstance.isHealthy = false; // Mark instance as unhealthy on crash
          bestInstance.metrics.isHealthy = false;
          this.healthCheck().catch((_err) => {}); // Trigger health check
        });

        return page;
      } catch (error) {
        bestInstance.metrics.errors++;
        bestInstance.isHealthy = false; // Mark instance unhealthy
        bestInstance.metrics.isHealthy = false;
        this.healthCheck().catch((_err) => {}); // Trigger health check
        throw new Error(
          `Failed to create new page: ${(error as Error).message}`,
        );
      }
    }) as Promise<Page>; // Assert return type to satisfy signature
  }

  /**
   * Performs health checks on all instances.
   */
  private async healthCheck(): Promise<void> {
    if (this.isCleaningUp) return;

    const now = new Date();
    const checks: Promise<void>[] = [];

    for (const instance of this.pool) {
      checks.push(
        (async () => {
          if (!instance.isHealthy) {
            // Skip check if already marked unhealthy
            // Maybe still check age/idle here? For now, assume it will be removed.
            return;
          }
          let shouldRemove = false;
          let reason = "unknown";

          if (!instance.browser.isConnected()) {
            shouldRemove = true;
            reason = "browser disconnected";
          }
          if (
            !shouldRemove &&
            this.maxBrowserAge > 0 &&
            now.getTime() - instance.metrics.createdAt.getTime() >
              this.maxBrowserAge
          ) {
            shouldRemove = true;
            reason = "max age reached";
          }
          if (
            !shouldRemove &&
            this.pool.size > 1 &&
            instance.pages.size === 0 &&
            this.maxIdleTime > 0 &&
            now.getTime() - instance.metrics.lastUsed.getTime() >
              this.maxIdleTime
          ) {
            shouldRemove = true;
            reason = "idle timeout";
          }

          if (shouldRemove) {
            instance.isHealthy = false;
            instance.metrics.isHealthy = false;
            await this.closeAndRemoveInstance(instance, reason);
          } else {
            instance.isHealthy = true; // Ensure marked healthy if checks pass
            instance.metrics.isHealthy = true;
          }
        })().catch((_err) => {
          // Log errors during individual check? For now, ignore.
        }),
      );
    }

    try {
      await Promise.allSettled(checks);
    } finally {
      // Always ensure minimum instances and reschedule check
      this.ensureMinimumInstances();
      this.scheduleHealthCheck();
    }
  }

  /**
   * Closes and removes a browser instance from the pool.
   */
  private async closeAndRemoveInstance(
    instance: PlaywrightBrowserInstance,
    _reason?: string, // Reason is unused, prefixed
  ): Promise<void> {
    const removed = this.pool.delete(instance);
    if (!removed) return;

    instance.browser.off("disconnected", instance.disconnectedHandler);
    try {
      await instance.context.close();
    } catch (_error) {
      /* Ignore context close errors */
    }
    try {
      await instance.browser.close();
    } catch (_error) {
      /* Ignore browser close errors */
    }
  }

  /**
   * Releases a page back to the pool, closing it.
   */
  public async releasePage(page: Page): Promise<void> {
    if (!page || page.isClosed()) return;

    let ownerInstance: PlaywrightBrowserInstance | undefined;
    for (const instance of this.pool) {
      if (instance.pages.has(page)) {
        ownerInstance = instance;
        break;
      }
    }

    try {
      await page.close();
      // If owner known, update metrics
      if (ownerInstance) {
        ownerInstance.pages.delete(page); // Ensure page is removed from set
        ownerInstance.metrics.activePages = ownerInstance.pages.size;
        ownerInstance.metrics.lastUsed = new Date();
      }
    } catch (error) {
      // If close fails, mark instance potentially unhealthy
      if (ownerInstance) {
        ownerInstance.isHealthy = false;
        ownerInstance.metrics.isHealthy = false;
        ownerInstance.metrics.errors++;
        // Remove page from set even on error closing?
        ownerInstance.pages.delete(page);
        ownerInstance.metrics.activePages = ownerInstance.pages.size;
      }
    }
  }

  /**
   * Stops health checks and closes all browser instances.
   */
  public async cleanup(): Promise<void> {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    // Clear the queue
    this.acquireQueue.clear();
    await this.acquireQueue.onIdle();

    const closePromises = [...this.pool].map((instance) =>
      this.closeAndRemoveInstance(instance, "cleanup"),
    );
    this.pool.clear();
    await Promise.allSettled(closePromises);
    this.isCleaningUp = false;
  }

  /**
   * Retrieves metrics for each browser instance in the pool.
   */
  public getMetrics(): BrowserMetrics[] {
    // Return a copy of metrics, ensuring health/active state is up-to-date
    return [...this.pool].map((instance) => ({
      ...instance.metrics,
      activePages: instance.pages.size,
      isHealthy: instance.isHealthy,
    }));
  }
}

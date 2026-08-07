// Import chromium directly from playwright
import {
  chromium as playwrightChromiumLauncher,
  Browser as PlaywrightBrowserType,
  ChromiumBrowser as PlaywrightChromiumBrowserInstanceType,
  BrowserContext,
  Page,
  Route,
  LaunchOptions,
  BrowserServer,
} from "playwright";
import type { BrowserMetrics } from "../types.js";
import UserAgent from "user-agents";
import { v4 as uuidv4 } from "uuid";
import PQueue from "p-queue";

// Import addExtra from playwright-extra
import { addExtra } from "playwright-extra";
import { DEFAULT_BROWSER_CLOSE_TIMEOUT } from "../constants.js";
import { createFetchAbortedError, isFetchAbortedError, waitForAbortSignal } from "../errors.js";
// Import PuppeteerExtraPlugin type (base type for stealth plugin)
import type { PuppeteerExtraPlugin } from "puppeteer-extra-plugin";

// Interface to describe the augmented Chromium LAUNCHER from playwright-extra
// It extends the generic BrowserType launcher and adds the .use() method.
interface AugmentedChromiumLauncher {
  launch(options?: LaunchOptions): Promise<PlaywrightChromiumBrowserInstanceType>;
  use(plugin: PuppeteerExtraPlugin): this;
}

type StealthPluginFactory = () => PuppeteerExtraPlugin;
let stealthPluginFactory: StealthPluginFactory | undefined;

// Asynchronous function to load dependencies (now mainly for stealth plugin)
async function loadDependencies() {
  if (!stealthPluginFactory) {
    const stealthModule = await import("puppeteer-extra-plugin-stealth");
    stealthPluginFactory = stealthModule.default as StealthPluginFactory;
  }
}

function createOwningLauncher(onServer: (server: BrowserServer) => void): AugmentedChromiumLauncher {
  if (!stealthPluginFactory) {
    throw new Error("Stealth plugin dependencies have not been loaded.");
  }

  const owningLauncher = new Proxy(playwrightChromiumLauncher, {
    get(target, property, receiver) {
      if (property === "launch") {
        return async (options?: LaunchOptions): Promise<PlaywrightChromiumBrowserInstanceType> => {
          const browserServer = await target.launchServer(options);
          onServer(browserServer);
          return target.connect(browserServer.wsEndpoint());
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const launcher = addExtra(owningLauncher);
  launcher.use(stealthPluginFactory());
  return launcher as AugmentedChromiumLauncher;
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

export class ManagedBrowserInstance {
  public readonly id: string;
  public browser!: PlaywrightBrowserType;
  public context!: BrowserContext;
  private browserServer?: BrowserServer;
  public readonly pages: Set<Page> = new Set();
  public readonly metrics: BrowserMetrics;
  public isHealthy: boolean = true;
  private disconnectedHandler?: () => void;

  private readonly useHeadedMode: boolean;
  private readonly blockedDomains: string[];
  private readonly blockedResourceTypes: string[];
  private readonly proxyConfig?: { server: string; username?: string; password?: string };
  private readonly onDisconnect: (instanceId: string) => void;
  private readonly launchOptions?: LaunchOptions;
  private readonly closeTimeout: number;
  private initializationPromise: Promise<void> | null = null;
  private isClosing = false;
  private closePromise: Promise<void> | null = null;

  constructor(config: {
    useHeadedMode: boolean;
    blockedDomains: string[];
    blockedResourceTypes: string[];
    proxyConfig?: { server: string; username?: string; password?: string };
    onDisconnect: (instanceId: string) => void;
    launchOptions?: LaunchOptions;
    closeTimeout: number;
  }) {
    this.id = uuidv4();
    this.useHeadedMode = config.useHeadedMode;
    this.blockedDomains = config.blockedDomains;
    this.blockedResourceTypes = config.blockedResourceTypes;
    this.proxyConfig = config.proxyConfig;
    this.onDisconnect = config.onDisconnect;
    this.launchOptions = config.launchOptions;
    this.closeTimeout = config.closeTimeout;

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

  initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeInternal();
    }
    return this.initializationPromise;
  }

  private assertNotClosing(): void {
    if (this.isClosing) {
      throw new Error(`Browser instance ${this.id} is shutting down.`);
    }
  }

  private async initializeInternal(): Promise<void> {
    this.assertNotClosing();
    await loadDependencies(); // Ensure augmentedLauncher is ready

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

    // Start with default headless state based on useHeadedMode, and default args
    // Then merge with provided launchOptions, which can override headless and args.
    const mergedLaunchOptions: LaunchOptions = {
      headless: !this.useHeadedMode, // Default based on pool mode
      args: [...defaultLaunchArgs], // Default args
      proxy: this.proxyConfig, // Proxy from pool config (can be overridden by this.launchOptions.proxy)
      ...this.launchOptions, // User-provided options (can override headless, args, proxy)
    };

    // If user-provided launchOptions include args, ensure they are merged, not just replaced.
    // User args should ideally be additive or replace specific conflicting args intelligently.
    // For simplicity, we'll concatenate and de-duplicate, giving preference to user args for duplicates if any.
    if (this.launchOptions && this.launchOptions.args) {
      mergedLaunchOptions.args = Array.from(new Set([...defaultLaunchArgs, ...this.launchOptions.args]));
    }
    // Explicitly set headless from this.launchOptions if provided, otherwise default based on this.useHeadedMode
    if (this.launchOptions && typeof this.launchOptions.headless === "boolean") {
      mergedLaunchOptions.headless = this.launchOptions.headless;
    }

    const augmentedLauncher = createOwningLauncher((browserServer) => {
      this.browserServer = browserServer;
      this.assertNotClosing();
    });
    this.browser = await augmentedLauncher.launch(mergedLaunchOptions);
    this.assertNotClosing();
    this.context = await this.browser.newContext({
      userAgent: new UserAgent().toString(),
      viewport: {
        width: 1280 + Math.floor(Math.random() * 120),
        height: 720 + Math.floor(Math.random() * 80),
      },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });
    this.assertNotClosing();

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
      } catch (routeError: unknown) {
        const message = routeError instanceof Error ? routeError.message : String(routeError);
        console.debug(
          `Error in ManagedBrowserInstance (${this.id}) route interceptor for URL ${url}: ${message}. Request continued.`,
          routeError instanceof Error ? routeError : undefined
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

  async acquirePage(signal?: AbortSignal): Promise<Page> {
    if (!this.isHealthy) {
      throw new Error(`Browser instance ${this.id} is not healthy.`);
    }
    try {
      const pagePromise = this.context.newPage();
      const page = await waitForAbortSignal(pagePromise, signal).catch(async (error: unknown) => {
        void pagePromise.then(
          (latePage) => latePage.close().catch(() => undefined),
          () => undefined
        );
        throw error;
      });
      if (signal?.aborted) {
        await page.close().catch(() => undefined);
        throw createFetchAbortedError();
      }
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
    } catch (error: unknown) {
      if (isFetchAbortedError(error) || signal?.aborted) {
        throw createFetchAbortedError(error instanceof Error ? error : undefined);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create new page in instance ${this.id}: ${message}`, error);
      this.metrics.errors++;
      this.isHealthy = false;
      this.metrics.isHealthy = false;
      this.onDisconnect(this.id);
      throw new Error(`Failed to create new page in instance ${this.id}: ${message}`);
    }
  }

  async releasePage(page: Page): Promise<void> {
    if (this.pages.has(page) && !page.isClosed()) {
      try {
        await page.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Error closing page in instance ${this.id}: ${message}`, error);
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

  private async closeInternal(reason?: string): Promise<void> {
    this.isClosing = true;
    this.isHealthy = false;
    this.metrics.isHealthy = false;
    console.log(`Closing browser instance ${this.id}, reason: ${reason || "cleanup"}`);
    await this.initializationPromise?.catch(() => undefined);

    if (this.browser && this.disconnectedHandler) {
      this.browser.off("disconnected", this.disconnectedHandler);
    }

    const browserServer = this.browserServer;
    const gracefulShutdown = (async (): Promise<void> => {
      if (this.context) {
        await this.context.close().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Error closing context for instance ${this.id}: ${message}`, error);
        });
      }
      if (this.browser) {
        await this.browser.close().catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`Error closing browser connection for instance ${this.id}: ${message}`, error);
        });
      }
      await browserServer?.close();
    })();

    let gracefulTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        gracefulShutdown,
        new Promise<never>((_resolve, reject) => {
          gracefulTimeout = setTimeout(
            () => reject(new Error(`Graceful browser shutdown exceeded ${this.closeTimeout}ms`)),
            this.closeTimeout
          );
        }),
      ]);
    } catch (gracefulError: unknown) {
      void gracefulShutdown.catch(() => undefined);
      if (!browserServer) {
        throw gracefulError;
      }
      console.warn(
        `Graceful shutdown failed or exceeded ${this.closeTimeout}ms for browser instance ${this.id}; terminating the owned browser process tree.`
      );
      await browserServer.kill();
    } finally {
      if (gracefulTimeout) clearTimeout(gracefulTimeout);
    }

    if (browserServer) {
      const browserProcess = browserServer.process();
      if (browserProcess.exitCode === null && browserProcess.signalCode === null) {
        throw new Error(`Browser process for instance ${this.id} is still running after cleanup.`);
      }
    }
  }

  close(reason?: string): Promise<void> {
    if (!this.closePromise) {
      this.closePromise = this.closeInternal(reason);
    }
    return this.closePromise;
  }
}

/**
 * Manages a pool of Playwright Browser instances for efficient reuse.
 */
export class PlaywrightBrowserPool {
  private static cleanupBarrier: Promise<void> = Promise.resolve();
  private pool: Set<ManagedBrowserInstance> = new Set();
  private readonly maxBrowsers: number;
  private readonly maxPagesPerContext: number;
  private readonly maxBrowserAge: number;
  private readonly healthCheckInterval: number;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly maxIdleTime: number;
  private isCleaningUp: boolean = false;
  private cleanupPromise: Promise<void> | null = null;
  private readonly pendingCreations: Map<ManagedBrowserInstance, Promise<ManagedBrowserInstance>> = new Map();
  private readonly useHeadedMode: boolean;
  private readonly blockedDomains: string[];
  private readonly blockedResourceTypes: string[];
  private readonly proxyConfig?: {
    server: string;
    username?: string;
    password?: string;
  };
  private readonly launchOptions?: LaunchOptions;
  private readonly browserCloseTimeout: number;

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

  // The acquireQueue is used to serialize all page acquisition requests.
  // With concurrency: 1, it ensures that operations for finding/creating browser instances
  // and then acquiring a page from an instance are processed one at a time.
  // This prevents race conditions when checking pool capacity, creating new browser instances,
  // or selecting an instance from the pool, thus maintaining a consistent state for the pool.
  private readonly acquireQueue: PQueue = new PQueue({ concurrency: 1 });

  constructor(
    config: {
      maxBrowsers?: number;
      maxPagesPerContext?: number;
      maxBrowserAge?: number;
      browserCloseTimeout?: number;
      healthCheckInterval?: number;
      useHeadedMode?: boolean;
      blockedDomains?: string[];
      blockedResourceTypes?: string[];
      proxy?: { server: string; username?: string; password?: string };
      maxIdleTime?: number;
      launchOptions?: LaunchOptions;
    } = {}
  ) {
    this.maxBrowsers = config.maxBrowsers ?? 2;
    this.maxPagesPerContext = config.maxPagesPerContext ?? 6;
    this.maxBrowserAge = config.maxBrowserAge ?? 20 * 60 * 1000;
    this.browserCloseTimeout = config.browserCloseTimeout ?? DEFAULT_BROWSER_CLOSE_TIMEOUT;
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
  }

  public async initialize(): Promise<void> {
    await PlaywrightBrowserPool.cleanupBarrier;
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
        this.healthCheck().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `Scheduled PlaywrightBrowserPool health check process encountered an error: ${message}`,
            err instanceof Error ? err : undefined
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
      } catch {
        break;
      }
    }
  }

  private createBrowserInstanceRecord(): ManagedBrowserInstance {
    return new ManagedBrowserInstance({
      useHeadedMode: this.useHeadedMode,
      blockedDomains: this.blockedDomains,
      blockedResourceTypes: this.blockedResourceTypes,
      proxyConfig: this.proxyConfig,
      launchOptions: this.launchOptions,
      closeTimeout: this.browserCloseTimeout,
      onDisconnect: (instanceId) => {
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
          this.ensureMinimumInstances().catch((err) => {
            console.error(
              `Error ensuring minimum instances after removing disconnected instance ${instanceId}: ${err.message}`,
              err
            );
          });
        }
      },
    });
  }

  private async initializeBrowserInstance(instance: ManagedBrowserInstance): Promise<ManagedBrowserInstance> {
    await loadDependencies(); // Ensure dependencies are loaded
    try {
      await instance.initialize();
    } catch (error: unknown) {
      await instance.close("browser initialization failed");
      throw error;
    }
    if (this.isCleaningUp) {
      await instance.close("pool cleanup raced browser initialization");
      throw new Error("Pool is shutting down.");
    }
    this.pool.add(instance);
    return instance;
  }

  private async createBrowserInstance(): Promise<ManagedBrowserInstance> {
    if (this.isCleaningUp) {
      throw new Error("Pool is shutting down.");
    }

    const instance = this.createBrowserInstanceRecord();
    const creation = this.initializeBrowserInstance(instance);
    this.pendingCreations.set(instance, creation);
    try {
      return await creation;
    } finally {
      this.pendingCreations.delete(instance);
    }
  }

  public acquirePage(signal?: AbortSignal): Promise<Page> {
    const acquisition = this.acquireQueue.add(
      async () => {
        if (signal?.aborted) throw createFetchAbortedError();
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
            bestInstance = await waitForAbortSignal(this.createBrowserInstance(), signal);
          } catch (error: unknown) {
            if (isFetchAbortedError(error) || signal?.aborted) {
              throw createFetchAbortedError(error instanceof Error ? error : undefined);
            }
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
          const page = await bestInstance.acquirePage(signal);
          // page.on('close') and page.on('crash') are handled within ManagedBrowserInstance.acquirePage()
          return page;
        } catch (error: unknown) {
          if (isFetchAbortedError(error) || signal?.aborted) {
            throw createFetchAbortedError(error instanceof Error ? error : undefined);
          }
          // If page acquisition from the chosen instance fails, that instance would have marked itself unhealthy
          // and called onDisconnect, which triggers the pool to re-evaluate. We should throw here.
          const message = error instanceof Error ? error.message : String(error);
          console.error(
            `Failed to acquire page from instance ${bestInstance.id} (it might have become unhealthy): ${message}`,
            error
          );
          throw new Error(`Failed to acquire page from instance ${bestInstance.id}: ${message}`); // Re-throw to signal failure to the caller
        }
      },
      { signal }
    ) as Promise<Page>;
    return waitForAbortSignal(acquisition, signal).catch((error: unknown) => {
      if (isFetchAbortedError(error) || signal?.aborted) {
        throw createFetchAbortedError(error instanceof Error ? error : undefined);
      }
      throw error;
    });
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error ensuring minimum instances during health check: ${message}`, error);
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
      } catch (error: unknown) {
        // If releasePage in ManagedBrowserInstance itself throws (e.g., error during page.close()),
        // that method should handle marking the instance as unhealthy if necessary.
        // Log here for pool-level visibility.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Error while instance ${ownerInstance.id} was releasing page: ${message}`, error);
        // The instance's own error handling (e.g. in acquirePage or crash handler) should trigger onDisconnect
        // if the instance becomes critically unhealthy.
      }
    } else {
      // Page not found in any managed instance, try to close it as a orphaned page.
      try {
        await page.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Error closing an orphaned page (not found in any pool instance): ${message}`, error);
      }
    }
  }

  private async cleanupInternal(): Promise<void> {
    this.isCleaningUp = true;

    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    // Create a copy of the pool to iterate over, as closeAndRemoveInstance modifies the original set.
    const instancesToClose = new Set([...this.pool, ...this.pendingCreations.keys()]);
    const closePromises = [...instancesToClose].map((instance) => instance.close("pool cleanup"));

    this.pool.clear(); // Clear the main pool set immediately
    const closeResults = await Promise.allSettled(closePromises);

    await Promise.allSettled([...this.pendingCreations.values()]);
    await this.acquireQueue.onIdle();

    const failedClose = closeResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failedClose) throw failedClose.reason;
  }

  public cleanup(): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.isCleaningUp = true;

    const previousBarrier = PlaywrightBrowserPool.cleanupBarrier;
    this.cleanupPromise = previousBarrier.then(() => this.cleanupInternal());
    PlaywrightBrowserPool.cleanupBarrier = this.cleanupPromise;
    return this.cleanupPromise;
  }

  public getMetrics(): BrowserMetrics[] {
    return [...this.pool].map((instance) => instance.metrics);
  }
}

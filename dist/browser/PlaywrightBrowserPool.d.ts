import type { Page } from "playwright";
import type { BrowserMetrics } from "../types.js";
/**
 * Manages a pool of Playwright Browser instances for efficient reuse.
 */
export declare class PlaywrightBrowserPool {
    private pool;
    private readonly maxBrowsers;
    private readonly maxPagesPerContext;
    private readonly maxBrowserAge;
    private readonly healthCheckInterval;
    private healthCheckTimer;
    private readonly maxIdleTime;
    private isCleaningUp;
    private readonly useHeadedMode;
    private readonly blockedDomains;
    private readonly blockedResourceTypes;
    private readonly proxyConfig?;
    private static readonly DEFAULT_BLOCKED_DOMAINS;
    private static readonly DEFAULT_BLOCKED_RESOURCE_TYPES;
    private readonly acquireQueue;
    constructor(config?: {
        maxBrowsers?: number;
        maxPagesPerContext?: number;
        maxBrowserAge?: number;
        healthCheckInterval?: number;
        useHeadedMode?: boolean;
        blockedDomains?: string[];
        blockedResourceTypes?: string[];
        proxy?: {
            server: string;
            username?: string;
            password?: string;
        };
        maxIdleTime?: number;
    });
    /**
     * Initializes the pool and starts health checks.
     */
    initialize(): Promise<void>;
    /**
     * Schedules the next health check.
     */
    private scheduleHealthCheck;
    /**
     * Ensures the pool has the configured maximum number of browser instances.
     */
    private ensureMinimumInstances;
    /**
     * Creates a new Playwright Browser instance and adds it to the pool.
     */
    private createBrowserInstance;
    /**
     * Acquires a Page from a healthy browser instance in the pool.
     */
    acquirePage(): Promise<Page>;
    /**
     * Performs health checks on all instances.
     */
    private healthCheck;
    /**
     * Closes and removes a browser instance from the pool.
     */
    private closeAndRemoveInstance;
    /**
     * Releases a page back to the pool, closing it.
     */
    releasePage(page: Page): Promise<void>;
    /**
     * Stops health checks and closes all browser instances.
     */
    cleanup(): Promise<void>;
    /**
     * Retrieves metrics for each browser instance in the pool.
     */
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=PlaywrightBrowserPool.d.ts.map
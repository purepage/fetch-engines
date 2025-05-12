import { Page, LaunchOptions } from "playwright";
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
    private readonly launchOptions?;
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
        launchOptions?: LaunchOptions;
    });
    initialize(): Promise<void>;
    private scheduleHealthCheck;
    private ensureMinimumInstances;
    private createBrowserInstance;
    acquirePage(): Promise<Page>;
    private healthCheck;
    private closeAndRemoveInstance;
    releasePage(page: Page): Promise<void>;
    cleanup(): Promise<void>;
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=PlaywrightBrowserPool.d.ts.map
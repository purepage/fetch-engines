import { Page, LaunchOptions } from "playwright";
import type { BrowserMetrics, CDPConnectionOptions, PlaywrightBrowserDriver } from "../types.js";
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
    private readonly cdpEndpoint?;
    private readonly cdpConnectionOptions?;
    private readonly browserDriver;
    private static readonly DEFAULT_BLOCKED_DOMAINS;
    private static readonly DEFAULT_BLOCKED_RESOURCE_TYPES;
    private readonly acquireQueue;
    private readonly creationQueue;
    private readonly pendingRecoveryInstances;
    private recoveryBarrier;
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
        cdpEndpoint?: string;
        cdpConnectionOptions?: CDPConnectionOptions;
        browserDriver?: PlaywrightBrowserDriver;
    });
    initialize(): Promise<void>;
    private scheduleHealthCheck;
    private ensureMinimumInstances;
    private createBrowserInstanceIfCapacity;
    private createBrowserInstanceWithReservedCapacity;
    private handleUnexpectedDisconnect;
    private startRecovery;
    private recoverDisconnectedInstances;
    private waitForRecovery;
    acquirePage(): Promise<Page>;
    private healthCheck;
    private closeAndRemoveInstance;
    releasePage(page: Page): Promise<void>;
    cleanup(): Promise<void>;
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=PlaywrightBrowserPool.d.ts.map
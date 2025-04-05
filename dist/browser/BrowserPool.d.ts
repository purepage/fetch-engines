import { type Page } from "playwright";
import type { BrowserMetrics } from "../types.js";
export declare class BrowserPool {
    private pool;
    private readonly maxBrowsers;
    private readonly maxPagesPerBrowser;
    private readonly maxBrowserAge;
    private readonly healthCheckInterval;
    private healthCheckTimer?;
    private readonly maxIdleTime;
    private isCleaningUp;
    constructor(maxBrowsers?: number, maxPagesPerBrowser?: number, // Revisit how this limit is applied with Playwright contexts
    maxBrowserAge?: number, // 30 minutes
    healthCheckInterval?: number);
    private createBrowser;
    private closeAndRemoveBrowser;
    private healthCheck;
    private ensureMinimumBrowsers;
    private startHealthChecks;
    /**
     * Asynchronously initializes the browser pool, creating the first browser instance
     * and starting health checks. Should be called before acquiring pages.
     */
    initialize(): Promise<void>;
    acquirePage(): Promise<Page>;
    cleanup(): Promise<void>;
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=BrowserPool.d.ts.map
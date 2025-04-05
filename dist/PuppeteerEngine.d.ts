import type { HTMLFetchResult, BrowserMetrics } from "./types";
import type { IEngine } from "./IEngine";
/**
 * PuppeteerEngine - A headless browser engine that uses Puppeteer to render JavaScript-heavy pages
 * Ideal for SPAs and sites with anti-scraping measures
 */
export declare class PuppeteerEngine implements IEngine {
    private static browserPool;
    private readonly queue;
    private readonly cache;
    private readonly cacheTTL;
    private isInitializing;
    constructor(concurrentPages?: number);
    private initializeBrowserPool;
    fetchHTML(url: string): Promise<HTMLFetchResult>;
    private checkCache;
    private cacheResult;
    cleanup(): Promise<void>;
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=PuppeteerEngine.d.ts.map
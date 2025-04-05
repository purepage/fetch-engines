import type { HTMLFetchResult, BrowserMetrics, PlaywrightEngineConfig } from "./types.js";
import { IEngine } from "./IEngine.js";
/**
 * HybridEngine - Attempts fetching with FetchEngine first for speed,
 * then falls back to PlaywrightEngine for complex sites or specific errors.
 */
export declare class HybridEngine implements IEngine {
    private readonly fetchEngine;
    private readonly playwrightEngine;
    constructor(playwrightConfig?: PlaywrightEngineConfig);
    fetchHTML(url: string): Promise<HTMLFetchResult>;
    cleanup(): Promise<void>;
    getMetrics(): BrowserMetrics[];
}
//# sourceMappingURL=HybridEngine.d.ts.map
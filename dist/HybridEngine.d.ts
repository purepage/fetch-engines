import type { IEngine } from "./IEngine.js";
import type { HTMLFetchResult, PlaywrightEngineConfig, FetchOptions, BrowserMetrics } from "./types.js";
/**
 * HybridEngine - Tries FetchEngine first, falls back to PlaywrightEngine on failure.
 */
export declare class HybridEngine implements IEngine {
    private readonly fetchEngine;
    private readonly playwrightEngine;
    private readonly config;
    private readonly playwrightOnlyPatterns;
    constructor(config?: PlaywrightEngineConfig);
    private _isSpaShell;
    fetchHTML(url: string, options?: FetchOptions): Promise<HTMLFetchResult>;
    /**
     * Delegates getMetrics to the PlaywrightEngine.
     */
    getMetrics(): BrowserMetrics[];
    /**
     * Calls cleanup on both underlying engines.
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=HybridEngine.d.ts.map
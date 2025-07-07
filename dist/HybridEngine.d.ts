import type { IEngine } from "./IEngine.js";
import type { HTMLFetchResult, ContentFetchResult, ContentFetchOptions, PlaywrightEngineConfig, FetchOptions, BrowserMetrics } from "./types.js";
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
     * Fetches raw content from the specified URL using the hybrid approach.
     * Tries FetchEngine first, falls back to PlaywrightEngine on failure.
     * Mimics standard fetch API behavior.
     *
     * @param url The URL to fetch content from.
     * @param options Optional fetch options.
     * @returns A Promise resolving to a ContentFetchResult object.
     * @throws {FetchError} If both engines fail to fetch the content.
     */
    fetchContent(url: string, options?: ContentFetchOptions): Promise<ContentFetchResult>;
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
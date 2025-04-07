import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
/**
 * HybridEngine - Tries FetchEngine first, falls back to PlaywrightEngine on failure.
 */
export class HybridEngine {
    fetchEngine;
    playwrightEngine;
    config; // Store config for potential per-request PW overrides
    constructor(config = {}) {
        // Pass relevant config parts to each engine
        // FetchEngine only takes markdown option from the shared config
        this.fetchEngine = new FetchEngine({ markdown: config.markdown });
        this.playwrightEngine = new PlaywrightEngine(config);
        this.config = config; // Store for merging later
    }
    async fetchHTML(url, options = {}) {
        // FetchEngine uses its constructor config; it doesn't accept per-request options here.
        try {
            const fetchResult = await this.fetchEngine.fetchHTML(url);
            // If fetch succeeded, return its result directly (it handles its own markdown config)
            // No need to check contentType here, FetchEngine handles it based on its constructor.
            return fetchResult;
        }
        catch (fetchError) {
            console.warn(`FetchEngine failed for ${url}: ${fetchError.message}. Falling back to PlaywrightEngine.`);
            // Merge constructor config with per-request options for Playwright fallback
            const playwrightOptions = {
                ...this.config, // Start with base config given to HybridEngine
                ...options, // Override with per-request options
            };
            try {
                // Pass merged options to PlaywrightEngine
                const playwrightResult = await this.playwrightEngine.fetchHTML(url, playwrightOptions);
                return playwrightResult;
            }
            catch (playwrightError) {
                // Catch potential Playwright error
                console.error(`PlaywrightEngine fallback failed for ${url}: ${playwrightError.message}`);
                // Optionally, wrap or prioritize which error to throw
                // Throwing the Playwright error as it's the last one encountered
                throw playwrightError;
            }
        }
    }
    /**
     * Delegates getMetrics to the PlaywrightEngine.
     */
    getMetrics() {
        return this.playwrightEngine.getMetrics();
    }
    /**
     * Calls cleanup on both underlying engines.
     */
    async cleanup() {
        await Promise.allSettled([
            this.fetchEngine.cleanup(), // Although a no-op, call for consistency
            this.playwrightEngine.cleanup(),
        ]);
    }
}
//# sourceMappingURL=HybridEngine.js.map
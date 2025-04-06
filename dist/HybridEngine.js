import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
/**
 * HybridEngine - Attempts fetching with FetchEngine first for speed,
 * then falls back to PlaywrightEngine for complex sites or specific errors.
 */
export class HybridEngine {
    fetchEngine;
    playwrightEngine;
    constructor(playwrightConfig = {}) {
        this.fetchEngine = new FetchEngine();
        this.playwrightEngine = new PlaywrightEngine(playwrightConfig);
    }
    async fetchHTML(url) {
        try {
            // Attempt 1: Use the fast FetchEngine
            const fetchResult = await this.fetchEngine.fetchHTML(url);
            return fetchResult;
        }
        catch (_fetchError) {
            // Prefixed unused error
            // If FetchEngine fails (e.g., 403, network error, non-html), try Playwright
            try {
                const playwrightResult = await this.playwrightEngine.fetchHTML(url);
                return playwrightResult;
            }
            catch (playwrightError) {
                // If Playwright also fails, throw its error (potentially more informative)
                throw playwrightError;
            }
        }
    }
    async cleanup() {
        // Cleanup both engines concurrently
        await Promise.allSettled([this.fetchEngine.cleanup(), this.playwrightEngine.cleanup()]);
    }
    getMetrics() {
        // FetchEngine doesn't produce metrics, only PlaywrightEngine does
        return this.playwrightEngine.getMetrics();
    }
}
//# sourceMappingURL=HybridEngine.js.map
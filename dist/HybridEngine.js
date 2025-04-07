import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
/**
 * HybridEngine - Attempts fetching with FetchEngine first for speed,
 * then falls back to PlaywrightEngine for complex sites or specific errors.
 */
export class HybridEngine {
    fetchEngine;
    playwrightEngine;
    options;
    constructor(options = {}) {
        this.options = options;
        this.fetchEngine = new FetchEngine({ markdown: this.options.markdown });
        this.playwrightEngine = new PlaywrightEngine(this.options);
    }
    async fetchHTML(url, requestOptions = {}) {
        const useMarkdown = requestOptions.markdown === undefined ? this.options.markdown : requestOptions.markdown;
        try {
            const fetchResult = await this.fetchEngine.fetchHTML(url);
            if (!useMarkdown && this.options.markdown) {
                const likelyMarkdown = fetchResult.html.startsWith("#") || fetchResult.html.includes("\n\n---\n\n\n");
                if (likelyMarkdown) {
                    console.warn(`HybridEngine: FetchEngine returned Markdown, but HTML requested for ${url}. Falling back to Playwright.`);
                    throw new Error("FetchEngine returned unwanted Markdown format.");
                }
            }
            return fetchResult;
        }
        catch (fetchError) {
            try {
                const playwrightResult = await this.playwrightEngine.fetchHTML(url, { markdown: useMarkdown });
                return playwrightResult;
            }
            catch (playwrightError) {
                throw playwrightError;
            }
        }
    }
    async cleanup() {
        await Promise.allSettled([this.fetchEngine.cleanup(), this.playwrightEngine.cleanup()]);
    }
    getMetrics() {
        return this.playwrightEngine.getMetrics();
    }
}
//# sourceMappingURL=HybridEngine.js.map
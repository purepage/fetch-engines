import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import type { HTMLFetchResult, BrowserMetrics, PlaywrightEngineConfig } from "./types.js";
import { IEngine } from "./IEngine.js";

/**
 * HybridEngine - Attempts fetching with FetchEngine first for speed,
 * then falls back to PlaywrightEngine for complex sites or specific errors.
 */
export class HybridEngine implements IEngine {
  private readonly fetchEngine: FetchEngine;
  private readonly playwrightEngine: PlaywrightEngine;

  constructor(playwrightConfig: PlaywrightEngineConfig = {}) {
    this.fetchEngine = new FetchEngine();
    this.playwrightEngine = new PlaywrightEngine(playwrightConfig);
  }

  async fetchHTML(url: string): Promise<HTMLFetchResult> {
    try {
      // Attempt 1: Use the fast FetchEngine
      const fetchResult = await this.fetchEngine.fetchHTML(url);
      return fetchResult;
    } catch (_fetchError: any) {
      // Prefixed unused error
      // If FetchEngine fails (e.g., 403, network error, non-html), try Playwright
      try {
        const playwrightResult = await this.playwrightEngine.fetchHTML(url);
        return playwrightResult;
      } catch (playwrightError) {
        // If Playwright also fails, throw its error (potentially more informative)
        throw playwrightError;
      }
    }
  }

  async cleanup(): Promise<void> {
    // Cleanup both engines concurrently
    await Promise.allSettled([this.fetchEngine.cleanup(), this.playwrightEngine.cleanup()]);
  }

  getMetrics(): BrowserMetrics[] {
    // FetchEngine doesn't produce metrics, only PlaywrightEngine does
    return this.playwrightEngine.getMetrics();
  }
}

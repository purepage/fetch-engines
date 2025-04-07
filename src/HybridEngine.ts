import { FetchEngine, FetchEngineOptions } from "./FetchEngine.js";
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
  private readonly options: PlaywrightEngineConfig;

  constructor(options: PlaywrightEngineConfig = {}) {
    this.options = options;
    this.fetchEngine = new FetchEngine({ markdown: this.options.markdown });
    this.playwrightEngine = new PlaywrightEngine(this.options);
  }

  async fetchHTML(url: string, requestOptions: { markdown?: boolean } = {}): Promise<HTMLFetchResult> {
    const useMarkdown = requestOptions.markdown === undefined ? this.options.markdown : requestOptions.markdown;

    try {
      const fetchResult = await this.fetchEngine.fetchHTML(url);
      if (!useMarkdown && this.options.markdown) {
        const likelyMarkdown = fetchResult.html.startsWith("#") || fetchResult.html.includes("\n\n---\n\n\n");
        if (likelyMarkdown) {
          console.warn(
            `HybridEngine: FetchEngine returned Markdown, but HTML requested for ${url}. Falling back to Playwright.`
          );
          throw new Error("FetchEngine returned unwanted Markdown format.");
        }
      }
      return fetchResult;
    } catch (fetchError: any) {
      try {
        const playwrightResult = await this.playwrightEngine.fetchHTML(url, { markdown: useMarkdown });
        return playwrightResult;
      } catch (playwrightError) {
        throw playwrightError;
      }
    }
  }

  async cleanup(): Promise<void> {
    await Promise.allSettled([this.fetchEngine.cleanup(), this.playwrightEngine.cleanup()]);
  }

  getMetrics(): BrowserMetrics[] {
    return this.playwrightEngine.getMetrics();
  }
}

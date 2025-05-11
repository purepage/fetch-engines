import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import type { IEngine } from "./IEngine.js";
import type { HTMLFetchResult, PlaywrightEngineConfig, FetchOptions, BrowserMetrics } from "./types.js";

/**
 * HybridEngine - Tries FetchEngine first, falls back to PlaywrightEngine on failure.
 */
export class HybridEngine implements IEngine {
  private readonly fetchEngine: FetchEngine;
  private readonly playwrightEngine: PlaywrightEngine;
  private readonly config: PlaywrightEngineConfig; // Store config for potential per-request PW overrides

  constructor(config: PlaywrightEngineConfig = {}) {
    // Pass relevant config parts to each engine
    // FetchEngine only takes markdown option from the shared config
    // spaMode from config is primarily for PlaywrightEngine, but HybridEngine uses it for decision making.
    this.fetchEngine = new FetchEngine({ markdown: config.markdown });
    this.playwrightEngine = new PlaywrightEngine(config);
    this.config = config; // Store for merging later
  }

  private _isSpaShell(htmlContent: string): boolean {
    if (!htmlContent || htmlContent.length < 150) {
      // Very short content might be a shell or error
      // Heuristic: if it's very short AND contains noscript, good chance it's a shell.
      if (htmlContent.includes("<noscript>")) return true;
    }
    // Check for <noscript> tag
    if (htmlContent.includes("<noscript>")) return true;

    // Check for common empty root divs
    if (/<div id=(?:"|')?(root|app)(?:"|')?[^>]*>\s*<\/div>/i.test(htmlContent)) return true;

    // Check for empty title tag or no title tag at all
    if (/<title>\s*<\/title>/i.test(htmlContent) || !/<title[^>]*>/i.test(htmlContent)) return true;

    return false;
  }

  async fetchHTML(url: string, options: FetchOptions = {}): Promise<HTMLFetchResult> {
    // Determine effective SPA mode and markdown options
    // HybridEngine defaults to false for these if not otherwise specified in its own config or per-request options.
    const effectiveSpaMode =
      options.spaMode !== undefined ? options.spaMode : this.config.spaMode !== undefined ? this.config.spaMode : false;
    const effectiveMarkdown =
      options.markdown !== undefined
        ? options.markdown
        : this.config.markdown !== undefined
          ? this.config.markdown
          : false;

    // Prepare options for PlaywrightEngine, to be used in fallback scenarios
    // The order of spread and explicit assignment ensures that effectiveSpaMode and effectiveMarkdown (HybridEngine's interpretation)
    // are what PlaywrightEngine receives for these specific fields, while other configs are passed through.
    const playwrightOptions: FetchOptions & { markdown?: boolean; spaMode?: boolean } = {
      ...this.config, // Start with base config given to HybridEngine (e.g. spaRenderDelayMs)
      ...options, // Apply all per-request overrides first
      markdown: effectiveMarkdown, // Then ensure HybridEngine's resolved markdown is set
      spaMode: effectiveSpaMode, // Then ensure HybridEngine's resolved spaMode is set
    };

    try {
      const fetchResult = await this.fetchEngine.fetchHTML(url);

      // If FetchEngine succeeded AND spaMode is active, check if it's just a shell
      if (effectiveSpaMode && fetchResult && fetchResult.content) {
        if (this._isSpaShell(fetchResult.content)) {
          console.warn(
            `HybridEngine: FetchEngine returned likely SPA shell for ${url} in spaMode. Forcing PlaywrightEngine.`
          );
          // Fallback to PlaywrightEngine, passing the determined effective options
          return this.playwrightEngine.fetchHTML(url, playwrightOptions);
        }
      }
      // If not spaMode, or if spaMode but content is not a shell, return FetchEngine's result
      return fetchResult;
    } catch (fetchError: any) {
      console.warn(
        `HybridEngine: FetchEngine failed for ${url}: ${fetchError.message}. Falling back to PlaywrightEngine.`
      );
      try {
        // Fallback to PlaywrightEngine, passing the determined effective options
        const playwrightResult = await this.playwrightEngine.fetchHTML(url, playwrightOptions);
        return playwrightResult;
      } catch (playwrightError: any) {
        console.error(`HybridEngine: PlaywrightEngine fallback also failed for ${url}: ${playwrightError.message}`);
        throw playwrightError; // Throw the Playwright error as it's the last one encountered
      }
    }
  }

  /**
   * Delegates getMetrics to the PlaywrightEngine.
   */
  getMetrics(): BrowserMetrics[] {
    return this.playwrightEngine.getMetrics();
  }

  /**
   * Calls cleanup on both underlying engines.
   */
  async cleanup(): Promise<void> {
    await Promise.allSettled([
      this.fetchEngine.cleanup(), // Although a no-op, call for consistency
      this.playwrightEngine.cleanup(),
    ]);
  }
}

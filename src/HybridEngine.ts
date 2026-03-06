import { FetchEngine, FetchEngineHttpError } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import type { IEngine } from "./IEngine.js";
import { MarkdownConverter, injectSourceUrl } from "./utils/markdown-converter.js";
import {
  assessHtmlRenderNeed,
  assessSerializedContent,
  isRenderedContentMeaningfullyBetter,
} from "./utils/render-detection.js";
import type {
  HTMLFetchResult,
  ContentFetchResult,
  ContentFetchOptions,
  PlaywrightEngineConfig,
  FetchOptions,
  BrowserMetrics,
} from "./types.js";

/**
 * HybridEngine - Tries FetchEngine first, falls back to PlaywrightEngine on failure.
 */
export class HybridEngine implements IEngine {
  private readonly fetchEngine: FetchEngine;
  private readonly playwrightEngine: PlaywrightEngine;
  private readonly config: PlaywrightEngineConfig; // Store config for potential per-request PW overrides
  private readonly playwrightOnlyPatterns: (string | RegExp)[];

  constructor(config: PlaywrightEngineConfig = {}) {
    // Pass relevant config parts to each engine
    // HybridEngine fetches raw HTML first so it can decide whether rendering is necessary.
    this.fetchEngine = new FetchEngine({ markdown: false, headers: config.headers });
    this.playwrightEngine = new PlaywrightEngine(config);
    this.config = config; // Store for merging later
    this.playwrightOnlyPatterns = config.playwrightOnlyPatterns || [];
  }

  private _convertHtmlToMarkdown(htmlResult: HTMLFetchResult): HTMLFetchResult {
    try {
      const converter = new MarkdownConverter();
      const content = injectSourceUrl(
        converter.convert(htmlResult.content, { baseUrl: htmlResult.url }),
        htmlResult.url
      );
      return {
        ...htmlResult,
        content,
        contentType: "markdown",
      };
    } catch (conversionError: unknown) {
      console.error(`HybridEngine: Markdown conversion failed for ${htmlResult.url}:`, conversionError);
      return htmlResult;
    }
  }

  private _shouldAutoRender(fetchResult: HTMLFetchResult, forceSpaMode: boolean): boolean {
    if (forceSpaMode) {
      return true;
    }
    return assessHtmlRenderNeed(fetchResult.content).renderLikelyNeeded;
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

    // Prepare options for PlaywrightEngine, to be used in fallback scenarios or direct calls
    // Retrieve headers from constructor config and per-request options
    const constructorHeaders = this.config.headers || {};
    const requestSpecificHeaders = options.headers || {}; // 'options' is the FetchOptions argument to HybridEngine.fetchHTML

    // Merge them, with request-specific headers taking precedence
    const mergedHeadersForPlaywright = { ...constructorHeaders, ...requestSpecificHeaders };

    // Construct playwrightOptions, now with explicitly merged headers
    const playwrightOptions: FetchOptions & {
      markdown?: boolean;
      spaMode?: boolean;
      headers?: Record<string, string>;
    } = {
      ...this.config, // Spread config for other options (like spaRenderDelayMs, etc.)
      ...options, // Spread options for other options (like fastMode, etc.)
      headers: mergedHeadersForPlaywright, // Assign the correctly merged headers
      markdown: effectiveMarkdown,
      spaMode: effectiveSpaMode,
    };

    // Check playwrightOnlyPatterns first
    for (const pattern of this.playwrightOnlyPatterns) {
      if (typeof pattern === "string" && url.includes(pattern)) {
        console.warn(`HybridEngine: URL ${url} matches string pattern "${pattern}". Using PlaywrightEngine directly.`);
        return this.playwrightEngine.fetchHTML(url, playwrightOptions);
      } else if (pattern instanceof RegExp && pattern.test(url)) {
        console.warn(
          `HybridEngine: URL ${url} matches regex pattern "${pattern.toString()}". Using PlaywrightEngine directly.`
        );
        return this.playwrightEngine.fetchHTML(url, playwrightOptions);
      }
    }

    try {
      const fetchResult = await this.fetchEngine.fetchHTML(url, {
        markdown: false,
        headers: options.headers,
      });
      const httpPreferredResult = effectiveMarkdown ? this._convertHtmlToMarkdown(fetchResult) : fetchResult;

      if (!this._shouldAutoRender(fetchResult, effectiveSpaMode)) {
        return httpPreferredResult;
      }

      console.warn(`HybridEngine: HTTP fetch for ${url} looks incomplete. Attempting Playwright render.`);

      try {
        const playwrightResult = await this.playwrightEngine.fetchHTML(url, playwrightOptions);
        const staticAssessment = assessSerializedContent(httpPreferredResult.content, httpPreferredResult.contentType);
        const renderedAssessment = assessSerializedContent(playwrightResult.content, playwrightResult.contentType);

        if (!isRenderedContentMeaningfullyBetter(staticAssessment, renderedAssessment)) {
          console.warn(`HybridEngine: Playwright render for ${url} was not meaningfully better. Keeping HTTP result.`);
          return httpPreferredResult;
        }

        return playwrightResult;
      } catch (playwrightError: unknown) {
        const pwMessage = playwrightError instanceof Error ? playwrightError.message : String(playwrightError);
        console.warn(`HybridEngine: Playwright render failed for ${url}: ${pwMessage}. Returning HTTP result.`);
        return httpPreferredResult;
      }
    } catch (fetchError: unknown) {
      // If FetchEngine returned a 404, do not attempt Playwright fallback
      if (fetchError instanceof FetchEngineHttpError && fetchError.statusCode === 404) {
        console.warn(`HybridEngine: FetchEngine returned 404 for ${url}. Not falling back.`);
        throw fetchError;
      }
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.warn(`HybridEngine: FetchEngine failed for ${url}: ${message}. Falling back to PlaywrightEngine.`);
      try {
        // Fallback to PlaywrightEngine, passing the determined effective options
        const playwrightResult = await this.playwrightEngine.fetchHTML(url, playwrightOptions);
        return playwrightResult;
      } catch (playwrightError: unknown) {
        const pwMessage = playwrightError instanceof Error ? playwrightError.message : String(playwrightError);
        console.error(`HybridEngine: PlaywrightEngine fallback also failed for ${url}: ${pwMessage}`);
        throw playwrightError; // Throw the Playwright error as it's the last one encountered
      }
    }
  }

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
  async fetchContent(url: string, options: ContentFetchOptions = {}): Promise<ContentFetchResult> {
    // Check playwrightOnlyPatterns first
    for (const pattern of this.playwrightOnlyPatterns) {
      if (typeof pattern === "string" && url.includes(pattern)) {
        console.warn(
          `HybridEngine: URL ${url} matches string pattern "${pattern}". Using PlaywrightEngine directly for content fetch.`
        );
        return this.playwrightEngine.fetchContent(url, options);
      } else if (pattern instanceof RegExp && pattern.test(url)) {
        console.warn(
          `HybridEngine: URL ${url} matches regex pattern "${pattern.toString()}". Using PlaywrightEngine directly for content fetch.`
        );
        return this.playwrightEngine.fetchContent(url, options);
      }
    }

    try {
      // Try FetchEngine first
      const fetchResult = await this.fetchEngine.fetchContent(url, options);
      return fetchResult;
    } catch (fetchError: unknown) {
      // If FetchEngine returned a 404, do not attempt Playwright fallback
      if (fetchError instanceof FetchEngineHttpError && fetchError.statusCode === 404) {
        console.warn(`HybridEngine: FetchEngine returned 404 for content fetch ${url}. Not falling back.`);
        throw fetchError;
      }
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.warn(
        `HybridEngine: FetchEngine failed for content fetch ${url}: ${message}. Falling back to PlaywrightEngine.`
      );
      try {
        // Fallback to PlaywrightEngine
        const playwrightResult = await this.playwrightEngine.fetchContent(url, options);
        return playwrightResult;
      } catch (playwrightError: unknown) {
        const pwMessage = playwrightError instanceof Error ? playwrightError.message : String(playwrightError);
        console.error(`HybridEngine: PlaywrightEngine fallback also failed for content fetch ${url}: ${pwMessage}`);
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

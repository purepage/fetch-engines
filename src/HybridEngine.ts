import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import type { IEngine } from "./IEngine.js";
import type {
  HTMLFetchResult,
  ContentFetchResult,
  ContentFetchOptions,
  PlaywrightEngineConfig,
  FetchOptions,
  BrowserMetrics,
  PostOptions,
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
    // FetchEngine only takes markdown option from the shared config
    // spaMode from config is primarily for PlaywrightEngine, but HybridEngine uses it for decision making.
    this.fetchEngine = new FetchEngine({ markdown: config.markdown, headers: config.headers });
    this.playwrightEngine = new PlaywrightEngine(config);
    this.config = config; // Store for merging later
    this.playwrightOnlyPatterns = config.playwrightOnlyPatterns || [];
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
      // Prepare options for FetchEngine call
      const fetchEngineCallSpecificOptions: FetchOptions = {
        markdown: effectiveMarkdown, // Pass the resolved markdown setting
        headers: options.headers, // Pass only the request-specific headers. FetchEngine will merge these with its own constructor headers.
      };
      const fetchResult = await this.fetchEngine.fetchHTML(url, fetchEngineCallSpecificOptions);

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
    } catch (fetchError: any) {
      console.warn(
        `HybridEngine: FetchEngine failed for content fetch ${url}: ${fetchError.message}. Falling back to PlaywrightEngine.`
      );
      try {
        // Fallback to PlaywrightEngine
        const playwrightResult = await this.playwrightEngine.fetchContent(url, options);
        return playwrightResult;
      } catch (playwrightError: any) {
        console.error(
          `HybridEngine: PlaywrightEngine fallback also failed for content fetch ${url}: ${playwrightError.message}`
        );
        throw playwrightError; // Throw the Playwright error as it's the last one encountered
      }
    }
  }

  /**
   * Sends a POST request expecting HTML in response.
   * Attempts FetchEngine first then falls back to PlaywrightEngine.
   */
  async postHTML(
    url: string,
    body: string | URLSearchParams | FormData,
    options: PostOptions = {}
  ): Promise<HTMLFetchResult> {
    const constructorHeaders = this.config.headers || {};
    const requestHeaders = options.headers || {};
    const mergedHeadersForPlaywright = { ...constructorHeaders, ...requestHeaders };

    try {
      const fetchResult = await this.fetchEngine.postHTML(url, body, {
        headers: requestHeaders,
        markdown: options.markdown,
      });
      return fetchResult;
    } catch (fetchError: any) {
      console.warn(
        `HybridEngine: FetchEngine POST failed for ${url}: ${fetchError.message}. Falling back to PlaywrightEngine.`
      );
      return this.playwrightEngine.postHTML(url, body, {
        ...options,
        headers: mergedHeadersForPlaywright,
      });
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

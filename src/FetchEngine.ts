import type { HTMLFetchResult, BrowserMetrics } from "./types.js"; // Added .js extension
import type { IEngine } from "./IEngine.js"; // Added .js extension
import { JSDOM } from "jsdom";

/**
 * Custom error class for HTTP errors from FetchEngine.
 */
export class FetchEngineHttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "FetchEngineHttpError";
    this.statusCode = statusCode;
    // Maintain proper stack trace (requires target ES2015+ in tsconfig)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchEngineHttpError);
    }
  }
}

/**
 * FetchEngine - A lightweight engine for fetching HTML content using the standard `fetch` API.
 *
 * Ideal for fetching content from static websites or APIs where JavaScript execution is not required.
 * It does not support advanced configurations like retries, caching, or proxies directly.
 */
export class FetchEngine implements IEngine {
  private readonly headers: Record<string, string>;

  /**
   * Creates an instance of FetchEngine.
   * Note: This engine currently does not accept configuration options.
   */
  constructor() {
    this.headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    };
  }

  /**
   * Fetches HTML content from the specified URL using the `fetch` API.
   *
   * @param url The URL to fetch.
   * @returns A Promise resolving to an HTMLFetchResult object.
   * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
   * @throws {Error} If the content type is not HTML or for other network errors.
   */
  async fetchHTML(url: string): Promise<HTMLFetchResult> {
    try {
      const response = await fetch(url, {
        headers: this.headers,
        redirect: "follow",
      });

      if (!response.ok) {
        // Throw the custom error with status code
        throw new FetchEngineHttpError(
          `HTTP error! status: ${response.status}`,
          response.status,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        throw new Error("Not an HTML page");
      }

      const html = await response.text();

      // Use JSDOM to parse HTML and extract title
      const dom = new JSDOM(html);
      const title = dom.window.document.title || "";

      // Check for potential SPA markers
      const isSPA = this.detectSPA(dom.window.document);
      if (isSPA) {
        // Removed throwing error here, as the calling code should decide how to handle this.
        // Consider adding a flag to the result instead.
        console.warn(
          `SPA detected for ${url}, content might be incomplete without JavaScript rendering.`,
        );
        // Example: return { html, title, url: response.url, isSPA: true };
      }

      return {
        html,
        title,
        url: response.url,
        isFromCache: false, // FetchEngine doesn't cache
        statusCode: response.status,
        error: undefined,
      };
    } catch (error: any) {
      // console.error(`FetchEngine failed for ${url}:`, error); // Optional: Keep logging if desired
      // Re-throw the original error to preserve its type (e.g., FetchEngineHttpError)
      // Ensure the result conforms to HTMLFetchResult even on error (for consistency? No, spec says throw)
      throw error;
    }
  }

  private detectSPA(document: Document): boolean {
    // Check for common SPA frameworks and patterns
    const spaMarkers = [
      // React
      "[data-reactroot]",
      "#root",
      "#app",
      // Vue
      "[data-v-app]",
      "#app[data-v-]",
      // Angular
      "[ng-version]",
      "[ng-app]",
      // Common SPA patterns
      'script[type="application/json+ld"]', // Less reliable marker
      'meta[name="fragment"]',
    ];

    // Check if the body is nearly empty but has JS (More reliable)
    const bodyContent = document.body?.textContent?.trim() || "";
    const hasScripts = document.scripts.length > 0;

    if (bodyContent.length < 150 && hasScripts) {
      // Increased threshold slightly
      return true;
    }

    // Check for SPA markers (Less reliable)
    return spaMarkers.some(
      (selector) => document.querySelector(selector) !== null,
    );
  }

  /**
   * Cleans up resources used by the engine.
   * For FetchEngine, this is a no-op as it doesn't manage persistent resources.
   * @returns A Promise that resolves when cleanup is complete.
   */
  async cleanup(): Promise<void> {
    // No resources to clean up for fetch engine
    return Promise.resolve(); // Explicitly return resolved promise
  }

  /**
   * Retrieves metrics for the engine.
   * FetchEngine does not manage browsers, so it returns an empty array.
   * @returns An empty array.
   */
  getMetrics(): BrowserMetrics[] {
    // Fetch engine doesn't maintain browser pool metrics
    return [];
  }
}

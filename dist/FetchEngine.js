import { JSDOM } from "jsdom";
import { MarkdownConverter } from "./utils/markdown-converter.js"; // Import the converter
/**
 * Custom error class for HTTP errors from FetchEngine.
 */
export class FetchEngineHttpError extends Error {
    statusCode;
    constructor(message, statusCode) {
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
export class FetchEngine {
    headers;
    options; // Store options
    /**
     * Creates an instance of FetchEngine.
     * @param options Configuration options for the FetchEngine.
     */
    constructor(options = {}) {
        // Accept options
        this.options = options; // Store options
        this.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        };
    }
    /**
     * Fetches HTML or converts to Markdown from the specified URL.
     *
     * @param url The URL to fetch.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
     * @throws {Error} If the content type is not HTML or for other network errors.
     */
    async fetchHTML(url) {
        let htmlContent;
        let responseStatus;
        let finalUrl;
        try {
            const response = await fetch(url, {
                headers: this.headers,
                redirect: "follow",
            });
            responseStatus = response.status;
            finalUrl = response.url; // Capture final URL after redirects
            if (!response.ok) {
                throw new FetchEngineHttpError(`HTTP error! status: ${response.status}`, response.status);
            }
            const contentType = response.headers.get("content-type") || "";
            if (!contentType.includes("text/html")) {
                throw new Error(`Not an HTML page (Content-Type: ${contentType})`);
            }
            htmlContent = await response.text();
        }
        catch (error) {
            // Rethrow specific FetchEngineHttpError, otherwise wrap in a generic error
            if (error instanceof FetchEngineHttpError) {
                throw error;
            }
            else if (error instanceof Error) {
                throw new Error(`Fetch failed for ${url}: ${error.message}`);
            }
            else {
                throw new Error(`Fetch failed for ${url}: Unknown error`);
            }
        }
        // Process the HTML (Title extraction, Markdown conversion)
        try {
            const dom = new JSDOM(htmlContent);
            const title = dom.window.document.title || "";
            const document = dom.window.document;
            // Perform Markdown conversion if requested
            let finalContent = htmlContent;
            if (this.options.markdown) {
                try {
                    const converter = new MarkdownConverter();
                    finalContent = converter.convert(htmlContent);
                    // Optional: If markdown is requested, maybe clear the title? Or keep it?
                    // title = ""; // Decide if title is relevant for Markdown output
                }
                catch (conversionError) {
                    console.error(`Markdown conversion failed for ${url}:`, conversionError);
                    // Decide behavior: return original HTML or throw/return error indication?
                    // Returning original HTML for now
                    finalContent = htmlContent;
                }
            }
            // Consider SPA detection - maybe add a flag to the result? Currently just warns.
            if (!this.options.markdown && this.detectSPA(document)) {
                console.warn(`SPA detected for ${url}, HTML content might be incomplete.`);
            }
            return {
                html: finalContent, // Return original HTML or Markdown
                title,
                url: finalUrl,
                isFromCache: false,
                statusCode: responseStatus,
                error: undefined, // No error at this stage if successful
            };
        }
        catch (processingError) {
            console.error(`Error processing HTML for ${url}:`, processingError);
            // If processing fails after successful fetch, return raw HTML with an error indicator? Or throw?
            // Throwing for now, as the processing step is part of the expected operation.
            const message = processingError instanceof Error ? processingError.message : "Unknown processing error";
            throw new Error(`Failed to process content for ${url}: ${message}`);
        }
    }
    detectSPA(document) {
        const spaMarkers = [
            "[data-reactroot]",
            "#root",
            "#app",
            "[data-v-app]",
            "#app[data-v-]",
            "[ng-version]",
            "[ng-app]",
            'script[type="application/json+ld"]',
            'meta[name="fragment"]',
        ];
        const bodyContent = document.body?.textContent?.trim() || "";
        const hasScripts = document.scripts.length > 0;
        if (bodyContent.length < 150 && hasScripts) {
            return true;
        }
        return spaMarkers.some((selector) => document.querySelector(selector) !== null);
    }
    /**
     * Cleans up resources used by the engine.
     * For FetchEngine, this is a no-op as it doesn't manage persistent resources.
     * @returns A Promise that resolves when cleanup is complete.
     */
    async cleanup() {
        return Promise.resolve();
    }
    /**
     * Retrieves metrics for the engine.
     * FetchEngine does not manage browsers, so it returns an empty array.
     * @returns An empty array.
     */
    getMetrics() {
        return [];
    }
}
//# sourceMappingURL=FetchEngine.js.map
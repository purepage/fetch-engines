import { MarkdownConverter } from "./utils/markdown-converter.js"; // Import the converter
import { FetchError } from "./errors.js"; // Only import FetchError
/**
 * Custom error class for HTTP errors from FetchEngine.
 */
export class FetchEngineHttpError extends FetchError {
    statusCode;
    constructor(message, statusCode) {
        super(message, "ERR_HTTP_ERROR", undefined, statusCode);
        this.statusCode = statusCode;
        this.name = "FetchEngineHttpError";
    }
}
/**
 * FetchEngine - A lightweight engine for fetching HTML content using the standard `fetch` API.
 *
 * Ideal for fetching content from static websites or APIs where JavaScript execution is not required.
 * It does not support advanced configurations like retries, caching, or proxies directly.
 */
export class FetchEngine {
    options;
    static DEFAULT_OPTIONS = {
        markdown: false,
        headers: {},
    };
    /**
     * Creates an instance of FetchEngine.
     * @param options Configuration options for the FetchEngine.
     */
    constructor(options = {}) {
        this.options = { ...FetchEngine.DEFAULT_OPTIONS, ...options };
    }
    /**
     * Fetches HTML or converts to Markdown from the specified URL.
     *
     * @param url The URL to fetch.
     * @returns A Promise resolving to an HTMLFetchResult object.
     * @throws {FetchEngineHttpError} If the HTTP response status is not ok (e.g., 404, 500).
     * @throws {Error} If the content type is not HTML or for other network errors.
     */
    async fetchHTML(url, options) {
        const effectiveOptions = { ...this.options, ...options }; // Combine constructor and call options
        let response;
        try {
            const baseHeaders = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            };
            // this.options.headers are headers passed to the constructor
            const constructorHeaders = this.options.headers || {};
            // options.headers are headers passed directly to the fetchHTML method
            // options is the second argument to fetchHTML: async fetchHTML(url: string, options?: FetchEngineOptions)
            const callSpecificHeaders = options?.headers || {};
            const finalHeaders = {
                ...baseHeaders,
                ...constructorHeaders,
                ...callSpecificHeaders, // Ensures callSpecificHeaders override constructorHeaders, which override baseHeaders
            };
            response = await fetch(url, {
                redirect: "follow",
                headers: finalHeaders,
            });
            if (!response.ok) {
                throw new FetchEngineHttpError(`HTTP error! status: ${response.status}`, response.status);
            }
            const contentTypeHeader = response.headers.get("content-type");
            if (!contentTypeHeader || !contentTypeHeader.includes("text/html")) {
                throw new FetchError("Content-Type is not text/html", "ERR_NON_HTML_CONTENT");
            }
            const html = await response.text();
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : null;
            let finalContent = html;
            let finalContentType = "html";
            if (effectiveOptions.markdown) {
                try {
                    const converter = new MarkdownConverter();
                    finalContent = converter.convert(html);
                    finalContentType = "markdown";
                }
                catch (conversionError) {
                    console.error(`Markdown conversion failed for ${url} (FetchEngine):`, conversionError);
                    // Fallback to original HTML on conversion error
                }
            }
            return {
                content: finalContent,
                contentType: finalContentType,
                title: title,
                url: response.url, // Use the final URL after redirects
                isFromCache: false,
                statusCode: response.status,
                error: undefined,
            };
        }
        catch (error) {
            // Re-throw specific known errors directly
            if (error instanceof FetchEngineHttpError ||
                (error instanceof FetchError && error.code === "ERR_NON_HTML_CONTENT")) {
                throw error;
            }
            // Wrap other/unexpected errors
            const message = error instanceof Error ? error.message : "Unknown fetch error";
            throw new FetchError(`Fetch failed: ${message}`, "ERR_FETCH_FAILED", error instanceof Error ? error : undefined);
        }
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
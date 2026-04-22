import { FetchEngine, FetchEngineHttpError } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import { MarkdownConverter, injectSourceUrl } from "./utils/markdown-converter.js";
import { FetchError } from "./errors.js";
import { assessHtmlRenderNeed, assessSerializedContent, isRenderedContentMeaningfullyBetter, isSoftBlockPage, } from "./utils/render-detection.js";
/**
 * HybridEngine - Tries FetchEngine first, falls back to PlaywrightEngine on failure.
 */
export class HybridEngine {
    static FETCH_ENGINE_RETRY_ATTEMPTS = 2;
    fetchEngine;
    playwrightEngine;
    config; // Store config for potential per-request PW overrides
    playwrightOnlyPatterns;
    constructor(config = {}) {
        // Pass relevant config parts to each engine
        // HybridEngine fetches raw HTML first so it can decide whether rendering is necessary.
        this.fetchEngine = new FetchEngine({ markdown: false, headers: config.headers });
        this.playwrightEngine = new PlaywrightEngine(config);
        this.config = config; // Store for merging later
        this.playwrightOnlyPatterns = config.playwrightOnlyPatterns || [];
    }
    _convertHtmlToMarkdown(htmlResult) {
        try {
            const converter = new MarkdownConverter();
            const content = injectSourceUrl(converter.convert(htmlResult.content, { baseUrl: htmlResult.url }), htmlResult.url);
            return {
                ...htmlResult,
                content,
                contentType: "markdown",
            };
        }
        catch (conversionError) {
            console.error(`HybridEngine: Markdown conversion failed for ${htmlResult.url}:`, conversionError);
            return htmlResult;
        }
    }
    _shouldAutoRender(fetchResult, forceSpaMode) {
        if (forceSpaMode) {
            return true;
        }
        if (isSoftBlockPage(fetchResult.content)) {
            return true;
        }
        return assessHtmlRenderNeed(fetchResult.content).renderLikelyNeeded;
    }
    _shouldRetryFetchEngine(error) {
        return error instanceof FetchError && (error.code === "ERR_FETCH_FAILED" || error.code === "ERR_FETCH_TIMEOUT");
    }
    async _fetchHtmlWithRetry(url, headers) {
        let lastError;
        for (let attempt = 1; attempt <= HybridEngine.FETCH_ENGINE_RETRY_ATTEMPTS; attempt += 1) {
            try {
                return await this.fetchEngine.fetchHTML(url, {
                    markdown: false,
                    headers,
                });
            }
            catch (error) {
                lastError = error;
                const canRetry = attempt < HybridEngine.FETCH_ENGINE_RETRY_ATTEMPTS && this._shouldRetryFetchEngine(error);
                if (!canRetry) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`HybridEngine: FetchEngine attempt ${attempt} for ${url} failed with a retryable error: ${message}. Retrying HTTP fetch.`);
            }
        }
        throw lastError;
    }
    async _fetchContentWithRetry(url, options = {}) {
        let lastError;
        for (let attempt = 1; attempt <= HybridEngine.FETCH_ENGINE_RETRY_ATTEMPTS; attempt += 1) {
            try {
                return await this.fetchEngine.fetchContent(url, options);
            }
            catch (error) {
                lastError = error;
                const canRetry = attempt < HybridEngine.FETCH_ENGINE_RETRY_ATTEMPTS && this._shouldRetryFetchEngine(error);
                if (!canRetry) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`HybridEngine: FetchEngine content attempt ${attempt} for ${url} failed with a retryable error: ${message}. Retrying HTTP fetch.`);
            }
        }
        throw lastError;
    }
    async fetchHTML(url, options = {}) {
        // Determine effective SPA mode and markdown options
        // HybridEngine defaults to false for these if not otherwise specified in its own config or per-request options.
        const effectiveSpaMode = options.spaMode !== undefined ? options.spaMode : this.config.spaMode !== undefined ? this.config.spaMode : false;
        const effectiveMarkdown = options.markdown !== undefined
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
        const playwrightOptions = {
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
            }
            else if (pattern instanceof RegExp && pattern.test(url)) {
                console.warn(`HybridEngine: URL ${url} matches regex pattern "${pattern.toString()}". Using PlaywrightEngine directly.`);
                return this.playwrightEngine.fetchHTML(url, playwrightOptions);
            }
        }
        try {
            const fetchResult = await this._fetchHtmlWithRetry(url, options.headers);
            const httpPreferredResult = effectiveMarkdown ? this._convertHtmlToMarkdown(fetchResult) : fetchResult;
            if (!this._shouldAutoRender(fetchResult, effectiveSpaMode)) {
                return httpPreferredResult;
            }
            console.warn(`HybridEngine: HTTP fetch for ${url} looks incomplete. Attempting Playwright render.`);
            // Skip HTTP fallback (we already know it's a shell) and use SPA rendering path for patient waits.
            const autoRenderOptions = {
                ...playwrightOptions,
                useHttpFallback: false,
                spaMode: true,
            };
            try {
                const playwrightResult = await this.playwrightEngine.fetchHTML(url, autoRenderOptions);
                const staticAssessment = assessSerializedContent(httpPreferredResult.content, httpPreferredResult.contentType);
                const renderedAssessment = assessSerializedContent(playwrightResult.content, playwrightResult.contentType);
                if (!isRenderedContentMeaningfullyBetter(staticAssessment, renderedAssessment)) {
                    console.warn(`HybridEngine: Playwright render for ${url} was not meaningfully better. Keeping HTTP result.`);
                    return httpPreferredResult;
                }
                return playwrightResult;
            }
            catch (playwrightError) {
                const pwMessage = playwrightError instanceof Error ? playwrightError.message : String(playwrightError);
                console.warn(`HybridEngine: Playwright render failed for ${url}: ${pwMessage}. Returning HTTP result.`);
                return httpPreferredResult;
            }
        }
        catch (fetchError) {
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
            }
            catch (playwrightError) {
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
    async fetchContent(url, options = {}) {
        // Check playwrightOnlyPatterns first
        for (const pattern of this.playwrightOnlyPatterns) {
            if (typeof pattern === "string" && url.includes(pattern)) {
                console.warn(`HybridEngine: URL ${url} matches string pattern "${pattern}". Using PlaywrightEngine directly for content fetch.`);
                return this.playwrightEngine.fetchContent(url, options);
            }
            else if (pattern instanceof RegExp && pattern.test(url)) {
                console.warn(`HybridEngine: URL ${url} matches regex pattern "${pattern.toString()}". Using PlaywrightEngine directly for content fetch.`);
                return this.playwrightEngine.fetchContent(url, options);
            }
        }
        try {
            // Try FetchEngine first
            const fetchResult = await this._fetchContentWithRetry(url, options);
            return fetchResult;
        }
        catch (fetchError) {
            // If FetchEngine returned a 404, do not attempt Playwright fallback
            if (fetchError instanceof FetchEngineHttpError && fetchError.statusCode === 404) {
                console.warn(`HybridEngine: FetchEngine returned 404 for content fetch ${url}. Not falling back.`);
                throw fetchError;
            }
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            console.warn(`HybridEngine: FetchEngine failed for content fetch ${url}: ${message}. Falling back to PlaywrightEngine.`);
            try {
                // Fallback to PlaywrightEngine
                const playwrightResult = await this.playwrightEngine.fetchContent(url, options);
                return playwrightResult;
            }
            catch (playwrightError) {
                const pwMessage = playwrightError instanceof Error ? playwrightError.message : String(playwrightError);
                console.error(`HybridEngine: PlaywrightEngine fallback also failed for content fetch ${url}: ${pwMessage}`);
                throw playwrightError; // Throw the Playwright error as it's the last one encountered
            }
        }
    }
    /**
     * Delegates getMetrics to the PlaywrightEngine.
     */
    getMetrics() {
        return this.playwrightEngine.getMetrics();
    }
    /**
     * Calls cleanup on both underlying engines.
     */
    async cleanup() {
        await Promise.allSettled([
            this.fetchEngine.cleanup(), // Although a no-op, call for consistency
            this.playwrightEngine.cleanup(),
        ]);
    }
}
//# sourceMappingURL=HybridEngine.js.map
# @purepageio/fetch-engines

A collection of configurable engines for fetching HTML content using plain `fetch` or Playwright.

This package provides robust and customisable ways to retrieve web page content, handling retries, caching, user agents, and optional browser automation via Playwright for complex JavaScript-driven sites.

## Installation

```bash
pnpm add @purepageio/fetch-engines
# or with npm
npm install @purepageio/fetch-engines
# or with yarn
yarn add @purepageio/fetch-engines
```

If you plan to use the `PlaywrightEngine` or `HybridEngine`, you also need to install Playwright's browser binaries:

```bash
pnpm exec playwright install
# or
npx playwright install
```

## Engines

- **`FetchEngine`**: Uses the standard `fetch` API. Suitable for simple HTML pages or APIs returning HTML. Lightweight and fast.
- **`PlaywrightEngine`**: Uses Playwright to control a managed pool of headless browsers (Chromium by default via `playwright-extra`). Handles JavaScript rendering, complex interactions, and provides automatic stealth/anti-bot detection measures. More resource-intensive but necessary for dynamic websites.
- **`HybridEngine`**: A smart combination. It first attempts to fetch content using the lightweight `FetchEngine`. If that fails for _any_ reason (e.g., network error, non-HTML content, HTTP error like 403), it automatically falls back to using the `PlaywrightEngine`. This provides the speed of `FetchEngine` for simple sites while retaining the power of `PlaywrightEngine` for complex ones.

## Basic Usage

### FetchEngine

```typescript
import { FetchEngine } from "@purepageio/fetch-engines";

const engine = new FetchEngine(); // Default: fetches HTML

async function main() {
  try {
    const url = "https://example.com";
    const result = await engine.fetchHTML(url);
    console.log(`Fetched ${result.url} (ContentType: ${result.contentType})`);
    console.log(`Title: ${result.title}`);
    console.log(`Content (HTML): ${result.content.substring(0, 100)}...`);

    // Example fetching Markdown directly via constructor option
    const markdownEngine = new FetchEngine({ markdown: true });
    const mdResult = await markdownEngine.fetchHTML(url);
    console.log(`\nFetched ${mdResult.url} (ContentType: ${mdResult.contentType})`);
    console.log(`Content (Markdown):\n${mdResult.content.substring(0, 300)}...`);
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}
main();
```

### PlaywrightEngine

```typescript
import { PlaywrightEngine } from "@purepageio/fetch-engines";

const engine = new PlaywrightEngine({ markdown: false }); // Default: fetches HTML

async function main() {
  try {
    const url = "https://quotes.toscrape.com/";
    // Fetch as HTML (using engine default)
    const htmlResult = await engine.fetchHTML(url);
    console.log(`Fetched ${htmlResult.url} (ContentType: ${htmlResult.contentType}) - Title: ${htmlResult.title}`);
    // console.log(`Content (HTML): ${htmlResult.content.substring(0, 200)}...`);

    // Fetch same URL as Markdown (using per-request override)
    const mdResult = await engine.fetchHTML(url, { markdown: true });
    console.log(`\nFetched ${mdResult.url} (ContentType: ${mdResult.contentType}) - Title: ${mdResult.title}`);
    console.log(`Content (Markdown):\n${mdResult.content.substring(0, 300)}...`);
  } catch (error) {
    console.error("Playwright fetch failed:", error);
  } finally {
    await engine.cleanup();
  }
}
main();
```

### HybridEngine

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine({ markdown: false }); // Default: fetches HTML for both internal engines

async function main() {
  try {
    const url1 = "https://example.com"; // Simple site
    const url2 = "https://quotes.toscrape.com/"; // Complex site

    // Request HTML (default) - FetchEngine likely succeeds
    const result1 = await engine.fetchHTML(url1);
    console.log(`Fetched ${result1.url} (ContentType: ${result1.contentType}) - Title: ${result1.title}`);

    // Request Markdown (per-request) - FetchEngine configured for HTML, so it returns HTML.
    const result2 = await engine.fetchHTML(url1, { markdown: true });
    console.log(`\nFetched ${result2.url} (ContentType: ${result2.contentType}) - Title: ${result2.title}`);
    console.log(`Content (HTML, as FetchEngine ignored override):\n${result2.content.substring(0, 300)}...`);

    // Request Markdown (per-request) - FetchEngine likely fails (or returns HTML), falls back to Playwright which gets the override.
    const result3 = await engine.fetchHTML(url2, { markdown: true });
    console.log(`\nFetched ${result3.url} (ContentType: ${result3.contentType}) - Title: ${result3.title}`);
    console.log(`Content (Markdown, via Playwright fallback):\n${result3.content.substring(0, 300)}...`);
  } catch (error) {
    console.error("Hybrid fetch failed:", error);
  } finally {
    await engine.cleanup();
  }
}
main();
```

## Configuration

Engines accept an optional configuration object in their constructor to customise behavior.

### FetchEngine

The `FetchEngine` accepts a `FetchEngineOptions` object:

- `markdown` (`boolean`, default: `false`)
  - If `true`, the fetched HTML content will be converted to Markdown. The result object's `content` property will contain Markdown, and `contentType` will be `'markdown'`.

```typescript
const mdFetchEngine = new FetchEngine({ markdown: true });
```

### PlaywrightEngine

The `PlaywrightEngine` accepts a `PlaywrightEngineConfig` object. See the detailed options below:

**General Options:**

- `concurrentPages` (`number`, default: `3`)
- `maxRetries` (`number`, default: `3`)
- `retryDelay` (`number`, default: `5000`)
- `cacheTTL` (`number`, default: `900000` (15 minutes))
- `useHttpFallback` (`boolean`, default: `true`)
- `useHeadedModeFallback` (`boolean`, default: `false`)
- `defaultFastMode` (`boolean`, default: `true`)
- `simulateHumanBehavior` (`boolean`, default: `true`)
- `markdown` (`boolean`, default: `false`)
  - If `true`, the fetched content (from HTTP fallback or Playwright) is converted to Markdown. The result's `content` will be Markdown, and `contentType` will be `'markdown'`. Can be overridden per-request.

**Browser Pool Options (Passed to internal `PlaywrightBrowserPool`):**

- `maxBrowsers` (`number`, default: `2`)
- `maxPagesPerContext` (`number`, default: `6`)
- `maxBrowserAge` (`number`, default: `1200000` (20 minutes))
- `healthCheckInterval` (`number`, default: `60000` (1 minute))
- `useHeadedMode` (`boolean`, default: `false`)
- `poolBlockedDomains` (`string[]`, default: `[]`)
- `poolBlockedResourceTypes` (`string[]`, default: `[]`)
- `proxy` (`object | undefined`, default: `undefined`)

### HybridEngine

The `HybridEngine` constructor accepts a single optional argument which follows the **`PlaywrightEngineConfig`** structure described above. These options configure both the underlying engines where applicable:

- Options like `maxRetries`, `cacheTTL`, `proxy`, `useHeadedMode`, etc., are primarily passed to the internal `PlaywrightEngine`.
- The `markdown` option (`boolean`, default: `false`) is passed to **both** the internal `FetchEngine` and `PlaywrightEngine` during their construction. This sets the default conversion behavior for the `HybridEngine`. Per-request overrides are only passed to the `PlaywrightEngine` if a fallback occurs.

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

// Fetch HTML by default, configure Playwright part
const engineHtml = new HybridEngine({ maxBrowsers: 1 });

// Fetch Markdown by default for both FetchEngine and PlaywrightEngine
const engineMd = new HybridEngine({
  markdown: true,
  maxRetries: 1, // Configure Playwright part
});
```

## Return Value

All `fetchHTML()` methods return a Promise that resolves to an `HTMLFetchResult` object:

- `content` (`string`): The fetched content, either original HTML or converted Markdown.
- `contentType` (`'html' | 'markdown'`): Indicates the format of the `content` string.
- `title` (`string | null`): Extracted page title (from original HTML).
- `url` (`string`): Final URL after redirects.
- `isFromCache` (`boolean`): True if the result came from cache.
- `statusCode` (`number | undefined`): HTTP status code.
- `error` (`Error | undefined`): Error object if the fetch failed.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): URL to fetch.
- `options?` (`FetchOptions`): Optional per-request overrides.
  - `markdown?: boolean`: (Playwright/Hybrid only) Request Markdown conversion. For Hybrid, only applies on fallback to Playwright.
  - `fastMode?: boolean`: (Playwright/Hybrid only) Override fast mode.
- **Returns:** `Promise<HTMLFetchResult>`

Fetches content, returning HTML or Markdown based on configuration/options in `result.content` with `result.contentType` indicating the format.

### `engine.cleanup()` (PlaywrightEngine & HybridEngine)

- **Returns:** `Promise<void>`

Gracefully shuts down all browser instances managed by the `PlaywrightEngine`'s browser pool (used by both `PlaywrightEngine` and `HybridEngine`). **It is crucial to call `await engine.cleanup()` when you are finished using these engines** to release system resources.

## Stealth / Anti-Detection (`PlaywrightEngine`)

The `PlaywrightEngine` automatically integrates `playwright-extra` and its powerful stealth plugin (`puppeteer-extra-plugin-stealth`). This plugin applies various techniques to make the headless browser controlled by Playwright appear more like a regular human-operated browser, helping to bypass many common bot detection systems.

There are **no manual configuration options** for stealth; it is enabled by default when using `PlaywrightEngine`. The previous options (`useStealthMode`, `randomizeFingerprint`, `evasionLevel`) have been removed.

While effective, be aware that no stealth technique is foolproof, and sophisticated websites may still detect automated browsing.

## Error Handling

Errors during fetching are typically thrown as instances of `FetchError` (or its subclasses like `FetchEngineHttpError`), providing more context than standard `Error` objects.

- `FetchError` properties:
  - `message` (`string`): Description of the error.
  - `code` (`string | undefined`): A specific error code (e.g., `ERR_NAVIGATION_TIMEOUT`, `ERR_HTTP_ERROR`, `ERR_NON_HTML_CONTENT`).
  - `originalError` (`Error | undefined`): The underlying error that caused this fetch error (e.g., a Playwright error object).

Common error scenarios include:

- Network issues (DNS resolution failure, connection refused).
- HTTP errors (4xx client errors, 5xx server errors).
- Non-HTML content type received (for `FetchEngine`).
- Playwright navigation timeouts.
- Proxy connection errors.
- Page crashes within Playwright.
- Errors thrown by the browser pool (e.g., failure to launch browser).

The `FetchResult` object may also contain an `error` property if the final fetch attempt failed after all retries.

## Logging

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/purepageio/fetch-engines).

## License

MIT

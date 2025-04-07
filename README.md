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

const engine = new FetchEngine({ markdown: false });

async function main() {
  try {
    const url = "https://example.com";
    const result = await engine.fetchHTML(url);
    console.log(`Fetched ${result.url} (Status: ${result.statusCode})`);
    console.log(`Title: ${result.title}`);
    console.log(`Result (HTML): ${result.html.substring(0, 100)}...`);

    // Example with Markdown
    const markdownEngine = new FetchEngine({ markdown: true });
    const mdResult = await markdownEngine.fetchHTML(url);
    console.log(`\nResult (Markdown):\n${mdResult.html.substring(0, 300)}...`);
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

main();
```

### PlaywrightEngine

```typescript
import { PlaywrightEngine } from "@purepageio/fetch-engines";

// Configure engine options (optional)
const engine = new PlaywrightEngine({
  maxRetries: 2, // Number of retry attempts
  useHttpFallback: true, // Try simple HTTP fetch first
  cacheTTL: 5 * 60 * 1000, // Cache results for 5 minutes (in milliseconds)
  markdown: false, // Explicitly false (default)
});

async function main() {
  try {
    const url = "https://quotes.toscrape.com/"; // A site that might benefit from JS rendering
    // Fetch as HTML
    const htmlResult = await engine.fetchHTML(url);
    console.log(`Fetched ${htmlResult.url} (HTML) - Title: ${htmlResult.title}`);
    // console.log(`HTML: ${htmlResult.html.substring(0, 200)}...`);

    // Fetch same URL as Markdown (per-request override)
    const mdResult = await engine.fetchHTML(url, { markdown: true });
    console.log(`\nFetched ${mdResult.url} (Markdown) - Title: ${mdResult.title}`);
    console.log(`Markdown:\n${mdResult.html.substring(0, 300)}...`);
  } catch (error) {
    console.error("Playwright fetch failed:", error);
  } finally {
    // Important: Clean up browser resources when done
    await engine.cleanup();
  }
}

main();
```

### HybridEngine

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

// Configure the underlying engines
const engine = new HybridEngine({
  // PlaywrightEngine specific config
  maxRetries: 2,
  maxBrowsers: 3,
  // Shared config
  markdown: false, // Apply to both FetchEngine and PlaywrightEngine by default
});

async function main() {
  try {
    // Try a simple site (likely uses FetchEngine, returns HTML)
    const url1 = "https://example.com";
    const result1 = await engine.fetchHTML(url1); // Gets HTML by default
    console.log(`Fetched ${result1.url} (HTML) - Title: ${result1.title}`);

    // Try a complex site (likely uses Playwright, returns HTML)
    const url2 = "https://quotes.toscrape.com/";
    const result2 = await engine.fetchHTML(url2); // Gets HTML by default
    console.log(`Fetched ${result2.url} (HTML) - Title: ${result2.title}`);

    // Fetch simple site as Markdown (FetchEngine configured with markdown=false, but overridden)
    // NOTE: HybridEngine passes override ONLY to Playwright. FetchEngine uses constructor config.
    // So, this will likely FAIL for FetchEngine (returning HTML) and then fallback to Playwright to get Markdown.
    const result3 = await engine.fetchHTML(url1, { markdown: true });
    console.log(`\nFetched ${result3.url} (Markdown via Fallback?) - Title: ${result3.title}`);
    console.log(`Markdown:\n${result3.html.substring(0, 300)}...`);

    // Fetch complex site as Markdown (Playwright gets override)
    const result4 = await engine.fetchHTML(url2, { markdown: true });
    console.log(`\nFetched ${result4.url} (Markdown via Playwright) - Title: ${result4.title}`);
    console.log(`Markdown:\n${result4.html.substring(0, 300)}...`);
  } catch (error) {
    console.error("Hybrid fetch failed:", error);
  } finally {
    // Important: Clean up browser resources (for the Playwright part) when done
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
  - If `true`, the fetched HTML content will be converted to Markdown before being returned in the `html` property of the result.

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
  - If `true`, the fetched HTML content (from either the HTTP fallback or the Playwright process) will be converted to Markdown before being returned in the `html` property of the result.

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
- The `markdown` option (`boolean`, default: `false`) is passed to **both** the internal `FetchEngine` and `PlaywrightEngine` during their construction. This sets the default conversion behavior for the `HybridEngine`.

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

All `fetchHTML()` methods return a Promise that resolves to an `HTMLFetchResult` object with the following properties:

- `html` (`string`): The full HTML content of the fetched page **or the converted Markdown content** if the `markdown` option was effectively `true` for the fetch operation.
- `title` (`string | null`): The extracted `<title>` tag content, or `null` if no title is found. (Note: Title might be less relevant or empty for Markdown results).
- `url` (`string`): The final URL after any redirects.
- `isFromCache` (`boolean`): `true` if the result was served from the engine's cache, `false` otherwise. (Note: Caching behavior with mixed HTML/Markdown requests should be considered - see PlaywrightEngine details).
- `statusCode` (`number | undefined`): The HTTP status code of the final response.
- `error` (`FetchError | Error | undefined`): If an error occurred during the _final_ fetch attempt (after retries), this property will contain the error object.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): The URL of the page to fetch.
- `options` (`object`, optional): Per-request options to override engine defaults.
  - For `PlaywrightEngine` and `HybridEngine`, you can override `markdown` (`boolean`) to enable or disable Markdown conversion for this specific request, overriding the constructor setting.
  - For `PlaywrightEngine`, you can override `fastMode` (`boolean`) to force or disable fast mode for this specific request.
- **Returns:** `Promise<HTMLFetchResult>`

Fetches the HTML content for the given URL using the engine's configured strategy (plain fetch or Playwright).

### `engine.cleanup()` (PlaywrightEngine only)

- **Returns:** `Promise<void>`

Gracefully shuts down all browser instances managed by the `PlaywrightEngine`'s browser pool. **It is crucial to call `await engine.cleanup()` when you are finished using a `PlaywrightEngine` instance** to release system resources.

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

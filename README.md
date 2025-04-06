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

const engine = new FetchEngine();

async function main() {
  try {
    const url = "https://example.com";
    const result = await engine.fetchHTML(url);
    console.log(`Fetched ${result.url} (Status: ${result.statusCode})`);
    console.log(`Title: ${result.title}`);
    // console.log(`HTML: ${result.html.substring(0, 200)}...`);
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
});

async function main() {
  try {
    const url = "https://quotes.toscrape.com/"; // A site that might benefit from JS rendering
    const result = await engine.fetchHTML(url);
    console.log(`Fetched ${result.url} (Status: ${result.statusCode})`);
    console.log(`Title: ${result.title}`);
    // console.log(`HTML: ${result.html.substring(0, 200)}...`);
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

// Configure the underlying PlaywrightEngine (optional)
const engine = new HybridEngine({
  maxRetries: 2, // PlaywrightEngine retry config
  maxBrowsers: 3, // PlaywrightEngine pool config
  // FetchEngine part has no config
});

async function main() {
  try {
    // Try a simple site (likely uses FetchEngine)
    const url1 = "https://example.com";
    const result1 = await engine.fetchHTML(url1);
    console.log(`Fetched ${result1.url} (Status: ${result1.statusCode}) - Title: ${result1.title}`);

    // Try a complex site (likely falls back to PlaywrightEngine)
    const url2 = "https://quotes.toscrape.com/";
    const result2 = await engine.fetchHTML(url2);
    console.log(`Fetched ${result2.url} (Status: ${result2.statusCode}) - Title: ${result2.title}`);
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

The `FetchEngine` currently has **no configurable options** via its constructor. It uses standard `fetch` with default browser/Node.js retry/timeout behavior and a fixed set of browser-like headers.

### PlaywrightEngine

The `PlaywrightEngine` accepts a `PlaywrightEngineConfig` object. See the detailed options below:

**General Options:**

- `concurrentPages` (`number`, default: `3`)
  - Maximum number of Playwright pages to process concurrently across all browser instances.
- `maxRetries` (`number`, default: `3`)
  - Maximum number of retry attempts for a failed Playwright fetch operation (excluding initial attempt).
- `retryDelay` (`number`, default: `5000`)
  - Delay in milliseconds between Playwright retry attempts.
- `cacheTTL` (`number`, default: `900000` (15 minutes))
  - Time-to-live for cached results in milliseconds. Set to `0` to disable the in-memory cache. Affects both HTTP fallback and Playwright results.
- `useHttpFallback` (`boolean`, default: `true`)
  - If `true`, the engine first attempts a simple, fast HTTP GET request. If this fails or appears to receive a challenge/CAPTCHA page, it then proceeds with a full Playwright browser request.
- `useHeadedModeFallback` (`boolean`, default: `false`)
  - If `true` and a Playwright request fails (potentially due to bot detection), subsequent Playwright requests _to that specific domain_ will automatically use a headed (visible) browser instance.
- `defaultFastMode` (`boolean`, default: `true`)
  - If `true`, Playwright requests initially run in "fast mode", blocking non-essential resources and skipping human behavior simulation. Can be overridden per-request via `fetchHTML` options.
- `simulateHumanBehavior` (`boolean`, default: `true`)
  - If `true` and the Playwright request is _not_ in `fastMode`, the engine attempts basic human-like interactions. _Note: This simulation is currently basic._

**Browser Pool Options (Passed to internal `PlaywrightBrowserPool`):**

- `maxBrowsers` (`number`, default: `2`)
  - Maximum number of concurrent browser instances the pool will manage.
- `maxPagesPerContext` (`number`, default: `6`)
  - Maximum number of pages per browser context before recycling.
- `maxBrowserAge` (`number`, default: `1200000` (20 minutes))
  - Maximum age in milliseconds a browser instance lives before recycling.
- `healthCheckInterval` (`number`, default: `60000` (1 minute))
  - How often (in milliseconds) the pool checks browser health.
- `useHeadedMode` (`boolean`, default: `false`)
  - Forces the _entire_ browser pool to launch browsers in headed (visible) mode.
- `poolBlockedDomains` (`string[]`, default: `[]` - uses pool's internal defaults)
  - List of domain _glob patterns_ to block browser requests to.
- `poolBlockedResourceTypes` (`string[]`, default: `[]` - uses pool's internal defaults)
  - List of Playwright resource types (e.g., `image`, `font`) to block.
- `proxy` (`object | undefined`, default: `undefined`)
  - Proxy configuration for browser instances (`server`, `username?`, `password?`).

### HybridEngine

The `HybridEngine` constructor accepts a single optional argument: `playwrightConfig`. This object follows the **`PlaywrightEngineConfig`** structure described above.

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine({
  // These options configure the PlaywrightEngine used for fallbacks
  maxRetries: 1,
  maxBrowsers: 1,
  cacheTTL: 0, // Disable caching in the Playwright part
});
```

The internal `FetchEngine` used by `HybridEngine` is _not_ configurable.

## Return Value

Both `FetchEngine.fetchHTML()` and `PlaywrightEngine.fetchHTML()` return a Promise that resolves to a `FetchResult` object with the following properties:

- `html` (`string`): The full HTML content of the fetched page.
- `title` (`string | null`): The extracted `<title>` tag content, or `null` if no title is found.
- `url` (`string`): The final URL after any redirects.
- `isFromCache` (`boolean`): `true` if the result was served from the engine's cache, `false` otherwise.
- `statusCode` (`number | undefined`): The HTTP status code of the final response. This is typically available for `FetchEngine` and the HTTP fallback in `PlaywrightEngine`, but might be `undefined` for some Playwright navigation scenarios if the primary response wasn't directly captured.
- `error` (`FetchError | Error | undefined`): If an error occurred during the _final_ fetch attempt (after retries), this property will contain the error object. It might be a specific `FetchError` (see Error Handling) or a generic `Error`.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): The URL of the page to fetch.
- `options` (`object`, optional): Per-request options to override engine defaults.
  - For `PlaywrightEngine`, you can override `fastMode` (`boolean`) to force or disable fast mode for this specific request.
  - _(Other per-request options may be added in the future)._
- **Returns:** `Promise<FetchResult>`

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

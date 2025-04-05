# @purepageio/fetch-engines

A collection of configurable engines for fetching HTML content using plain `fetch` or Playwright.

This package provides robust and customizable ways to retrieve web page content, handling retries, caching, user agents, and optional browser automation via Playwright for complex JavaScript-driven sites.

## Installation

```bash
pnpm add @purepageio/fetch-engines
# or with npm
npm install @purepageio/fetch-engines
# or with yarn
yarn add @purepageio/fetch-engines
```

If you plan to use the `PlaywrightEngine`, you also need to install Playwright's browser binaries:

```bash
pnpm exec playwright install
# or
npx playwright install
```

## Engines

- **`FetchEngine`**: Uses the standard `fetch` API. Suitable for simple HTML pages or APIs returning HTML. Lightweight and fast.
- **`PlaywrightEngine`**: Uses Playwright to control a headless browser (Chromium, Firefox, WebKit). Handles JavaScript rendering, complex interactions (if needed), and provides options for stealth and anti-bot detection measures. More resource-intensive but necessary for dynamic websites.

## Basic Usage

### FetchEngine

```typescript
import { FetchEngine } from "@purepageio/fetch-engines";

const engine = new FetchEngine();

async function main() {
  try {
    const url = "https://example.com";
    const result = await engine.fetchHTML(url);
    console.log(`Fetched ${result.url}`);
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
    console.log(`Fetched ${result.url}`);
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

## Configuration

Engines accept an optional configuration object in their constructor to customize behavior.

### FetchEngine

The `FetchEngine` currently has **no configurable options** via its constructor. It uses standard `fetch` with default browser/Node.js retry/timeout behavior and a fixed set of browser-like headers.

### PlaywrightEngine

The `PlaywrightEngine` offers more extensive configuration:

**General Options:**

- `concurrentPages` (`number`, default: `3`)
  - Maximum number of Playwright pages to process concurrently across all browser instances.
- `maxRetries` (`number`, default: `3`)
  - Maximum number of retry attempts for a failed fetch operation (excluding initial attempt).
- `retryDelay` (`number`, default: `5000`)
  - Delay in milliseconds between retry attempts.
- `cacheTTL` (`number`, default: `900000` (15 minutes))
  - Time-to-live for cached results in milliseconds. Set to `0` to disable the in-memory cache.
- `useHttpFallback` (`boolean`, default: `true`)
  - If `true`, the engine first attempts a simple, fast HTTP GET request. If this fails or appears to receive a challenge/CAPTCHA page, it then proceeds with a full Playwright browser request.
- `useHeadedModeFallback` (`boolean`, default: `false`)
  - If `true` and a Playwright request fails (potentially due to bot detection), subsequent requests _to that specific domain_ will automatically use a headed (visible) browser instance, which can sometimes bypass stricter checks. This requires the pool to potentially manage both headless and headed instances.
- `defaultFastMode` (`boolean`, default: `true`)
  - If `true`, requests initially run in "fast mode", blocking non-essential resources (images, fonts, stylesheets) and skipping human behavior simulation. This can significantly speed up fetches but may break some sites or increase detection risk. This can be overridden per-request via the `fetchHTML` options.
- `simulateHumanBehavior` (`boolean`, default: `true`)
  - If `true` and the request is _not_ in `fastMode`, the engine attempts basic human-like interactions (e.g., slight delays, mouse movements). _Note: This simulation is currently basic and may not defeat advanced bot detection._

**Browser Pool Options:**

These options are passed down to configure the underlying `PlaywrightBrowserPool` that manages browser instances.

- `maxBrowsers` (`number`, default: `2`)
  - Maximum number of concurrent browser instances (e.g., Chrome processes) the pool will manage.
- `maxPagesPerContext` (`number`, default: `6`)
  - Maximum number of pages that can be opened within a single browser context (like an isolated browser profile) before the pool prefers using a different context or browser instance. Helps isolate sessions.
- `maxBrowserAge` (`number`, default: `1200000` (20 minutes))
  - Maximum age in milliseconds a browser instance can live before the pool proactively closes and replaces it. Helps mitigate memory leaks or state issues.
- `healthCheckInterval` (`number`, default: `60000` (1 minute))
  - How often (in milliseconds) the pool checks the health of its browser instances (e.g., checking connectivity, age).
- `useHeadedMode` (`boolean`, default: `false`)
  - Forces the _entire_ browser pool to launch browsers in headed (visible) mode instead of the default headless mode. Primarily useful for debugging purposes.
- `poolBlockedDomains` (`string[]`, default: `[]` - uses pool's internal defaults)
  - List of domain _glob patterns_ (e.g., `*.google-analytics.com`, `*.doubleclick.net`) for requests that the browser should block. An empty array uses the pool's built-in default blocklist (recommended).
- `poolBlockedResourceTypes` (`string[]`, default: `[]` - uses pool's internal defaults)
  - List of Playwright resource types (e.g., `image`, `stylesheet`, `font`, `media`, `websocket`) to block. Blocking unnecessary resources can speed up page loads. An empty array uses the pool's built-in default blocklist (recommended).
- `proxy` (`object | undefined`, default: `undefined`)
  - Proxy configuration to be used by the browser instances.
    - `server` (`string`): Proxy URL (e.g., `http://host:port`, `socks5://user:pass@host:port`).
    - `username` (`string`, optional): Proxy username.
    - `password` (`string`, optional): Proxy password.

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

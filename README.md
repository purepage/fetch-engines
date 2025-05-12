# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fetching web content can be complex. You need to handle static HTML, dynamic JavaScript-driven sites, network errors, retries, caching, and potential bot detection measures. Managing browser automation tools like Playwright adds another layer of complexity with resource pooling and stealth configurations.

`@purepageio/fetch-engines` simplifies this entire process by providing a set of robust, configurable, and easy-to-use engines for retrieving web page content.

**Why use `@purepageio/fetch-engines`?**

- **Unified API:** Get content from simple or complex sites using the same `fetchHTML(url, options?)` method.
- **Flexible Strategies:** Choose the right tool for the job:
  - `FetchEngine`: Lightweight and fast for static HTML, using the standard `fetch` API.
  - `PlaywrightEngine`: Powerful browser automation for JavaScript-heavy sites, handling rendering and interactions.
  - `HybridEngine`: The best of both worlds – tries `FetchEngine` first for speed, automatically falls back to `PlaywrightEngine` for reliability on complex pages.
- **Robust & Resilient:** Built-in caching, configurable retries, and standardized error handling make your fetching logic more dependable.
- **Simplified Automation:** `PlaywrightEngine` manages browser instances and contexts automatically through efficient pooling and includes integrated stealth measures to bypass common anti-bot systems.
- **Content Transformation:** Optionally convert fetched HTML directly to clean Markdown content.
- **TypeScript Ready:** Fully typed for a better development experience.

This package provides a high-level abstraction, letting you focus on using the web content rather than the intricacies of fetching it.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Engines](#engines)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Return Value](#return-value)
- [API Reference](#api-reference)
- [Stealth / Anti-Detection (`PlaywrightEngine`)](#stealth--anti-detection-playwrightengine)
- [Error Handling](#error-handling)
- [Logging](#logging)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Multiple Fetching Strategies:** Choose between `FetchEngine` (lightweight `fetch`), `PlaywrightEngine` (robust JS rendering via Playwright), or `HybridEngine` (smart fallback).
- **Unified API:** Simple `fetchHTML(url, options?)` interface across all engines.
- **Configurable Retries:** Automatic retries on failure with customizable attempts and delays.
- **Built-in Caching:** In-memory caching with configurable TTL to reduce redundant fetches.
- **Playwright Stealth:** Automatic integration of `playwright-extra` and stealth plugins to bypass common bot detection.
- **Managed Browser Pooling:** Efficient resource management for `PlaywrightEngine` with configurable browser/context limits and lifecycles.
- **Smart Fallbacks:** `HybridEngine` uses `FetchEngine` first, falling back to `PlaywrightEngine` only when needed. `PlaywrightEngine` can optionally use a fast HTTP fetch before launching a full browser.
- **Content Conversion:** Optionally convert fetched HTML directly to Markdown.
- **Standardized Errors:** Custom `FetchError` classes provide context on failures.
- **TypeScript Ready:** Fully typed codebase for enhanced developer experience.

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

// Engine configured to fetch HTML by default and pass custom launch arguments
const engine = new PlaywrightEngine({
  markdown: false,
  playwrightLaunchOptions: { args: ['--disable-gpu'] } 
});

async function main() {
  try {
    const url = "https://quotes.toscrape.com/";

    // Example: Fetching as Markdown using per-request override
    console.log(`Fetching ${url} as Markdown...`);
    const mdResult = await engine.fetchHTML(url, { markdown: true });
    console.log(`Fetched ${mdResult.url} (ContentType: ${mdResult.contentType}) - Title: ${mdResult.title}`);
    console.log(`Content (Markdown):\n${mdResult.content.substring(0, 300)}...`);

    // You could also fetch as HTML by default:
    // const htmlResult = await engine.fetchHTML(url);
    // console.log(`\nFetched ${htmlResult.url} (ContentType: ${htmlResult.contentType}) - Title: ${htmlResult.title}`);
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

// Engine configured to fetch HTML by default for both internal engines
const engine = new HybridEngine({ markdown: false });

async function main() {
  try {
    const url1 = "https://example.com"; // Simple site
    const url2 = "https://quotes.toscrape.com/"; // Complex site

    // --- Scenario 1: FetchEngine Succeeds ---
    console.log(`\nFetching simple site (${url1}) requesting Markdown...`);
    // FetchEngine uses its constructor config (markdown: false), ignoring the per-request option.
    const result1 = await engine.fetchHTML(url1, { markdown: true });
    console.log(`Fetched ${result1.url} (ContentType: ${result1.contentType}) - Title: ${result1.title}`);
    console.log(`Content is ${result1.contentType} because FetchEngine succeeded and used its own config.`);
    console.log(`${result1.content.substring(0, 300)}...`);

    // --- Scenario 2: FetchEngine Fails, Playwright Fallback Occurs ---
    console.log(`\nFetching complex site (${url2}) requesting Markdown...`);
    // Assume FetchEngine fails for url2. PlaywrightEngine will be used and *will* receive the markdown: true override.
    const result2 = await engine.fetchHTML(url2, { markdown: true });
    console.log(`Fetched ${result2.url} (ContentType: ${result2.contentType}) - Title: ${result2.title}`);
    console.log(`Content is ${result2.contentType} because Playwright fallback used the per-request option.`);
    console.log(`${result2.content.substring(0, 300)}...`);
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

The `FetchEngine` accepts a `FetchEngineOptions` object with the following properties:

| Option     | Type      | Default | Description                                                                                            |
| ---------- | --------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `markdown` | `boolean` | `false` | If `true`, converts fetched HTML to Markdown. `contentType` in the result will be set to `'markdown'`. |

```typescript
// Example: Always convert to Markdown
const mdFetchEngine = new FetchEngine({ markdown: true });
```

### PlaywrightEngine

The `PlaywrightEngine` accepts a `PlaywrightEngineConfig` object with the following properties:

**General Options:**

| Option                  | Type                       | Default  | Description                                                                                                                                                                                                                                                             |
| ----------------------- | -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown`              | `boolean`                  | `false`  | If `true`, converts content (from Playwright or its internal HTTP fallback) to Markdown. `contentType` will be `'markdown'`. Can be overridden per-request.                                                                                                           |
| `useHttpFallback`       | `boolean`                  | `true`   | If `true`, attempts a fast HTTP fetch before using Playwright. Ineffective if `spaMode` is `true`.                                                                                                                                                                  |
| `useHeadedModeFallback` | `boolean`                  | `false`  | If `true`, automatically retries specific failed Playwright attempts in headed (visible) mode.                                                                                                                                                                       |
| `defaultFastMode`       | `boolean`                  | `true`   | If `true`, initially blocks non-essential resources and skips human simulation. Can be overridden per-request. Effectively `false` if `spaMode` is `true`.                                                                                                           |
| `simulateHumanBehavior` | `boolean`                  | `true`   | If `true` (and not `fastMode` or `spaMode`), attempts basic human-like interactions.                                                                                                                                                                                  |
| `concurrentPages`       | `number`                   | `3`      | Max number of pages to process concurrently within the engine queue.                                                                                                                                                                                                    |
| `maxRetries`            | `number`                   | `3`      | Max retry attempts for a failed fetch (excluding initial try).                                                                                                                                                                                                          |
| `retryDelay`            | `number`                   | `5000`   | Delay (ms) between retries.                                                                                                                                                                                                                                             |
| `cacheTTL`              | `number`                   | `900000` | Cache Time-To-Live (ms). `0` disables caching. (15 mins default)                                                                                                                                                                                                        |
| `spaMode`               | `boolean`                  | `false`  | If `true`, enables Single Page Application mode. This typically bypasses `useHttpFallback`, effectively sets `fastMode` to `false`, uses more patient load conditions (e.g., network idle), and may apply `spaRenderDelayMs`. Recommended for JavaScript-heavy sites. |
| `spaRenderDelayMs`      | `number`                   | `0`      | Explicit delay (ms) after page load events in `spaMode` to allow for client-side rendering. Only applies if `spaMode` is `true`.                                                                                                                                        |
| `playwrightLaunchOptions`| `LaunchOptions`            | `undefined`| Optional Playwright launch options (from `playwright` package, e.g., `{ args: ['--some-flag'] }`) passed when a browser instance is created. Merged with internal defaults.                                                                                      |

**Browser Pool Options (Passed to internal `PlaywrightBrowserPool`):**

| Option                     | Type                       | Default     | Description                                                               |
| -------------------------- | -------------------------- | ----------- | ------------------------------------------------------------------------- |
| `maxBrowsers`              | `number`                   | `2`         | Max concurrent browser instances managed by the pool.                     |
| `maxPagesPerContext`       | `number`                   | `6`         | Max pages per browser context before recycling.                           |
| `maxBrowserAge`            | `number`                   | `1200000`   | Max age (ms) a browser instance lives before recycling. (20 mins default) |
| `healthCheckInterval`      | `number`                   | `60000`     | How often (ms) the pool checks browser health. (1 min default)            |
| `useHeadedMode`            | `boolean`                  | `false`     | Forces the _entire pool_ to launch browsers in headed (visible) mode.     |
| `poolBlockedDomains`       | `string[]`                 | `[]`        | List of domain glob patterns to block requests to.                        |
| `poolBlockedResourceTypes` | `string[]`                 | `[]`        | List of Playwright resource types (e.g., 'image', 'font') to block.       |
| `proxy`                    | `{ server: string, ... }?` | `undefined` | Proxy configuration object (see `PlaywrightEngineConfig` type).           |

### HybridEngine

The `HybridEngine` constructor accepts `PlaywrightEngineConfig` options. These settings configure the underlying engines and the hybrid strategy:

- **Constructor `markdown` option:**
  - Sets the default Markdown conversion for the internal `FetchEngine`. This `FetchEngine` instance **does not** react to per-request `markdown` overrides.
  - Sets the default for the internal `PlaywrightEngine`.
- **Constructor `spaMode` option:**
  - Sets the default SPA mode for `HybridEngine`. If `true`, `HybridEngine` checks `FetchEngine`'s output for SPA shell characteristics. If an SPA shell is detected, it forces a fallback to `PlaywrightEngine` (which will also run in SPA mode).
  - Sets the default for the internal `PlaywrightEngine`.
- **Other `PlaywrightEngineConfig` options** (e.g., `maxRetries`, `cacheTTL`, `playwrightLaunchOptions`, pool settings) are primarily passed to and used by the internal `PlaywrightEngine`.

**Per-request `options` in `HybridEngine.fetchHTML(url, options)`:**

- **`options.markdown` (`boolean`):**
  - If `FetchEngine` succeeds and its content is used (i.e., not an SPA shell when `spaMode` is active), this per-request `markdown` option is **ignored**. The content's format is determined by the `FetchEngine`'s constructor `markdown` setting.
  - If `HybridEngine` falls back to `PlaywrightEngine` (due to `FetchEngine` failure or SPA shell detection), this per-request `markdown` option **overrides** the `PlaywrightEngine`'s default and determines if its output is Markdown.
- **`options.spaMode` (`boolean`):**
  - Overrides the `HybridEngine`'s default SPA mode behavior for this specific request (affecting SPA shell detection and potential fallback to `PlaywrightEngine`).
  - If `PlaywrightEngine` is used, this option also overrides its default SPA mode.
- **`options.fastMode` (`boolean`):**
  - If `PlaywrightEngine` is used, this option overrides its `defaultFastMode` setting. It has no effect on `FetchEngine`.

```typescript
// Example: HybridEngine with SPA mode enabled by default
const spaHybridEngine = new HybridEngine({ spaMode: true, spaRenderDelayMs: 2000 });

async function fetchSpaSite() {
  try {
    // This will use PlaywrightEngine directly if smallblackdots is an SPA shell
    const result = await spaHybridEngine.fetchHTML(
      "https://www.smallblackdots.net/release/16109/corrina-joseph-wish-tonite-lonely"
    );
    console.log(`Title: ${result.title}`);
  } catch (e) {
    console.error(e);
  }
}
```

## Return Value

All `fetchHTML()` methods return a Promise that resolves to an `HTMLFetchResult` object:

- `content` (`string`): The fetched content, either original HTML or converted Markdown.
- `contentType` (`'html' | 'markdown'`): Indicates the format of the `content` string.
- `title` (`string | null`): Extracted page title (from original HTML).
- `url` (`string`): Final URL after redirects.
- `isFromCache` (`boolean`): True if the result came from cache.
- `statusCode` (`number | undefined`): HTTP status code.
- `error` (`Error | undefined`): Error object if the fetch failed after all retries. It's generally recommended to rely on catching thrown errors for failure handling.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): URL to fetch.
- `options?` (`FetchOptions`): Optional per-request overrides.
  - `markdown?: boolean`: (Playwright/Hybrid only) Request Markdown conversion. For Hybrid, only applies on fallback to Playwright.
  - `fastMode?: boolean`: (Playwright/Hybrid only) Override fast mode.
  - `spaMode?: boolean`: (Playwright/Hybrid only) Override SPA mode behavior for this request.
- **Returns:** `Promise<HTMLFetchResult>`

Fetches content, returning HTML or Markdown based on configuration/options in `result.content` with `result.contentType` indicating the format.

### `engine.cleanup()` (PlaywrightEngine & HybridEngine)

- **Returns:** `Promise<void>`

Gracefully shuts down all browser instances managed by the `PlaywrightEngine`'s browser pool (used by both `PlaywrightEngine` and `HybridEngine`). **It is crucial to call `await engine.cleanup()` when you are finished using these engines** to release system resources.

## Stealth / Anti-Detection (`PlaywrightEngine`)

The `PlaywrightEngine` automatically integrates `playwright-extra` and its powerful stealth plugin ([`puppeteer-extra-plugin-stealth`](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)). This plugin applies various techniques to make the headless browser controlled by Playwright appear more like a regular human-operated browser, helping to bypass many common bot detection systems.

There are **no manual configuration options** for stealth; it is enabled by default when using `PlaywrightEngine`. The previous options (`useStealthMode`, `randomizeFingerprint`, `evasionLevel`) have been removed.

While effective, be aware that no stealth technique is foolproof, and sophisticated websites may still detect automated browsing.

## Error Handling

Errors during fetching are typically thrown as instances of `FetchError` (or its subclasses like `FetchEngineHttpError`), providing more context than standard `Error` objects.

- `FetchError` properties:
  - `message` (`string`): Description of the error.
  - `code` (`string | undefined`): A specific error code (e.g., `ERR_NAVIGATION_TIMEOUT`, `ERR_HTTP_ERROR`, `ERR_NON_HTML_CONTENT`).
  - `originalError` (`Error | undefined`): The underlying error that caused this fetch error (e.g., a Playwright error object).
  - `statusCode` (`number | undefined`): The HTTP status code, if relevant (especially for `FetchEngineHttpError`).

Common `FetchError` codes and scenarios:

- **`ERR_HTTP_ERROR`**: Thrown by `FetchEngine` for HTTP status codes >= 400. `error.statusCode` will be set.
- **`ERR_NON_HTML_CONTENT`**: Thrown by `FetchEngine` if the content type is not HTML and `markdown` conversion is not requested.
- **`ERR_PLAYWRIGHT_OPERATION`**: A general error from `PlaywrightEngine` indicating a failure during a Playwright operation (e.g., page acquisition, navigation, interaction). The `originalError` property will often contain the specific Playwright error.
- **`ERR_NAVIGATION`**: Often seen as part of `ERR_PLAYWRIGHT_OPERATION`'s message or in `originalError` when a Playwright navigation fails (e.g., timeout, SSL error).
- **`ERR_MARKDOWN_CONVERSION_NON_HTML`**: Thrown by `PlaywrightEngine` (or `HybridEngine` if falling back to Playwright) if `markdown: true` is requested for a non-HTML content type (e.g., XML, JSON).
- **`ERR_UNSUPPORTED_RAW_CONTENT_TYPE`**: Thrown by `PlaywrightEngine` if `markdown: false` is requested for a content type it doesn't support for direct fetching (e.g., images, applications). Currently, it primarily supports `text/*` and `application/json`, `application/xml` like types when `markdown: false`.
- **`ERR_CACHE_ERROR`**: Indicates an issue with cache read/write operations.
- **`ERR_PROXY_CONFIG_ERROR`**: Problem with proxy configuration.
- **`ERR_BROWSER_POOL_EXHAUSTED`**: If the browser pool cannot provide a page (e.g. max browsers reached and all are busy beyond timeout).
- **Other Scenarios (often wrapped by `ERR_PLAYWRIGHT_OPERATION` or a generic `FetchError`):**
    - Network issues (DNS resolution, connection refused).
    - Proxy connection failures.
    - Page crashes or context/browser disconnections within Playwright.
    - Failures during browser launch or management by the pool.

The `HTMLFetchResult` object may also contain an `error` property if the final fetch attempt failed after all retries but an earlier attempt (within retries) might have produced some intermediate (potentially unusable) result data. It's generally best to rely on the thrown error for failure handling.

**Example:**

```typescript
import { PlaywrightEngine, FetchError } from "@purepageio/fetch-engines";

// Example using PlaywrightEngine to illustrate more complex error handling
const engine = new PlaywrightEngine({ useHttpFallback: false, maxRetries: 1 });

async function fetchWithHandling(url: string) {
  try {
    const result = await engine.fetchHTML(url);
    if (result.error) {
      console.warn(`Fetch for ${url} included non-critical error after retries: ${result.error.message}`);
    }
    console.log(`Success for ${url}! Title: ${result.title}, Content type: ${result.contentType}`);
    // Use result.content
  } catch (error) {
    console.error(`Fetch failed for ${url}:`);
    if (error instanceof FetchError) {
      console.error(`  Error Code: ${error.code || "N/A"}`);
      console.error(`  Message: ${error.message}`);
      if (error.statusCode) {
        console.error(`  Status Code: ${error.statusCode}`);
      }
      if (error.originalError) {
        console.error(`  Original Error: ${error.originalError.name} - ${error.originalError.message}`);
      }
      // Example of specific handling:
      if (error.code === "ERR_PLAYWRIGHT_OPERATION") {
        console.error("  Hint: This was a Playwright operation failure. Check Playwright logs or originalError.");
      }
    } else if (error instanceof Error) {
      console.error(`  Generic Error: ${error.message}`);
    } else {
      console.error(`  Unknown error occurred: ${String(error)}`);
    }
  }
}

async function runExamples() {
  await fetchWithHandling("https://nonexistentdomain.example.com"); // Likely DNS or navigation error
  await fetchWithHandling("https://example.com/non_html_resource.json"); // Test with actual JSON URL if available
                                                                      // or a site known to cause Playwright issues for a demo.
  await engine.cleanup(); // Important for PlaywrightEngine
}

runExamples();
```

## Logging

Currently, the library uses `console.warn` and `console.error` for internal warnings (like fallback events) and critical errors. More sophisticated logging options may be added in the future.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/purepageio/fetch-engines).

## License

MIT



# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fetching web content effectively requires handling static HTML, dynamic JavaScript-driven sites, network errors, retries, caching, and bot detection. `@purepageio/fetch-engines` simplifies this by providing robust, configurable engines for retrieving web page content.

**Key Benefits:**

- **Unified API:** Fetch from simple or complex sites with `fetchHTML(url, options?)`.
- **Flexible Engines:**
  - `FetchEngine`: Fast, lightweight `fetch` for static HTML.
  - `PlaywrightEngine`: Powerful browser automation for dynamic sites, supporting raw text content (XML, JSON, TXT) when `markdown: false`.
  - `HybridEngine`: Smartly tries `FetchEngine` first, then falls back to `PlaywrightEngine`.
- **Resilient:** Built-in caching, retries, and standardized error handling.
- **Simplified Automation:** `PlaywrightEngine` offers managed browser pooling and integrated stealth measures.
- **Content Transformation:** Optionally convert HTML to clean Markdown.
- **TypeScript Ready:** Fully typed.

## Table of Contents

- [Installation](#installation)
- [Engines Overview](#engines-overview)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Return Value: `HTMLFetchResult`](#return-value-htmlfetchresult)
- [Error Handling](#error-handling)
- [Advanced Topics](#advanced-topics)
  - [Stealth / Anti-Detection (`PlaywrightEngine`)](#stealth--anti-detection-playwrightengine)
  - [Cleanup](#cleanup)
- [Contributing](#contributing)
- [License](#license)

## Installation

```bash
pnpm add @purepageio/fetch-engines
# or
npm install @purepageio/fetch-engines
# or
yarn add @purepageio/fetch-engines
```

For `PlaywrightEngine` or `HybridEngine`, install Playwright's browser binaries:
```bash
pnpm exec playwright install # or npx playwright install
```

## Engines Overview

- **`FetchEngine`**: Uses the standard `fetch` API. Best for simple HTML pages or APIs. Lightweight and fast.
- **`PlaywrightEngine`**: Leverages Playwright for headless browser automation. Essential for JavaScript-heavy sites. It can render dynamic content and also fetch various raw text-based content (like XML, JSON, TXT) if `markdown: false` is specified. Includes managed browser pooling and stealth features.
- **`HybridEngine`**: Combines speed and power. It first tries `FetchEngine`. If this fails (e.g., network error, non-HTML, 403), it automatically uses `PlaywrightEngine`.

## Basic Usage

### FetchEngine
```typescript
import { FetchEngine } from "@purepageio/fetch-engines";

const engine = new FetchEngine(); // Fetches HTML by default

async function main() {
  const result = await engine.fetchHTML("https://example.com");
  console.log(`Fetched ${result.url}, Title: ${result.title}`);
  // For Markdown: new FetchEngine({ markdown: true });
}
main();
```

### PlaywrightEngine
```typescript
import { PlaywrightEngine } from "@purepageio/fetch-engines";

// Fetches HTML by default
const engine = new PlaywrightEngine({ markdown: false });

async function main() {
  try {
    // Fetching HTML
    const htmlResult = await engine.fetchHTML("https://quotes.toscrape.com/");
    console.log(`Fetched HTML: ${htmlResult.title}`);

    // Fetching raw XML (e.g., a sitemap)
    const xmlResult = await engine.fetchHTML("https://www.google.com/sitemap.xml", { markdown: false });
    console.log(`Fetched XML (ContentType: ${xmlResult.contentType}): ${xmlResult.content.substring(0, 150)}...`);
    
    // Fetching as Markdown (per-request override)
    const mdResult = await engine.fetchHTML("https://quotes.toscrape.com/", { markdown: true });
    console.log(`Fetched Markdown: ${mdResult.title}`);
  } finally {
    await engine.cleanup(); // Important!
  }
}
main();
```

### HybridEngine
```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

// Fetches HTML by default for both internal engines
const engine = new HybridEngine({ markdown: false });

async function main() {
  try {
    // FetchEngine may succeed for example.com
    const result1 = await engine.fetchHTML("https://example.com");
    console.log(`Fetched ${result1.url}, Title: ${result1.title}`);

    // FetchEngine likely fails for quotes.toscrape.com, PlaywrightEngine takes over.
    // If markdown:true is passed in options, PlaywrightEngine will use it.
    const result2 = await engine.fetchHTML("https://quotes.toscrape.com/", { markdown: true });
    console.log(`Fetched ${result2.url} (ContentType: ${result2.contentType})`);
  } finally {
    await engine.cleanup(); // Important!
  }
}
main();
```

## Configuration

Engines accept an optional configuration object in their constructor.

### FetchEngine (`FetchEngineOptions`)

| Option     | Type      | Default | Description                                   |
| ---------- | --------- | ------- | --------------------------------------------- |
| `markdown` | `boolean` | `false` | If `true`, converts fetched HTML to Markdown. |

### PlaywrightEngine (`PlaywrightEngineConfig`)

**General Options:**

| Option                  | Type      | Default  | Description                                                                                 |
| ----------------------- | --------- | -------- | ------------------------------------------------------------------------------------------- |
| `markdown`              | `boolean` | `true`   | If `true`, converts HTML to Markdown. Can be overridden per-request.                        |
| `useHttpFallback`       | `boolean` | `true`   | If `true`, attempts a fast HTTP fetch before using Playwright.                              |
| `useHeadedModeFallback` | `boolean` | `false`  | If `true`, retries specific failed domains in headed (visible) mode.                        |
| `defaultFastMode`       | `boolean` | `true`   | Blocks non-essential resources & skips human simulation by default. Overridable per-request. |
| `simulateHumanBehavior` | `boolean` | `true`   | If `true` (and not `fastMode`), attempts basic human-like interactions.                     |
| `concurrentPages`       | `number`  | `3`      | Max concurrent pages processed by the engine.                                               |
| `maxRetries`            | `number`  | `3`      | Max retry attempts for a failed fetch.                                                      |
| `retryDelay`            | `number`  | `5000`   | Delay (ms) between retries.                                                                 |
| `cacheTTL`              | `number`  | `900000` | Cache Time-To-Live (ms). `0` disables. (15 mins default)                                    |

**Browser Pool Options (for internal `PlaywrightBrowserPool`):**

| Option                     | Type         | Default   | Description                                                            |
| -------------------------- | ------------ | --------- | ---------------------------------------------------------------------- |
| `maxBrowsers`              | `number`     | `2`       | Max concurrent browser instances.                                      |
| `maxPagesPerContext`       | `number`     | `6`       | Max pages per browser context.                                         |
| `maxBrowserAge`            | `number`     | `1200000` | Max browser age (ms) before recycling. (20 mins)                       |
| `healthCheckInterval`      | `number`     | `60000`   | Browser health check interval (ms). (1 min)                            |
| `useHeadedMode`            | `boolean`    | `false`   | Forces all pooled browsers to launch in headed (visible) mode.         |
| `poolBlockedDomains`       | `string[]`   | `[]`      | Glob patterns for domains to block.                                    |
| `poolBlockedResourceTypes` | `string[]`   | `[]`      | Playwright resource types (e.g., 'image', 'font') to block.            |
| `proxy`                    | `object`     | `undefined` | Proxy config (see `PlaywrightEngineConfig` type).                      |

### HybridEngine (`PlaywrightEngineConfig`)
The `HybridEngine` constructor uses the `PlaywrightEngineConfig` structure.
- Most options configure the internal `PlaywrightEngine` (e.g., `maxRetries`, `cacheTTL`, pool options).
- The `markdown` setting (`boolean`, default: `false` in `HybridEngine`'s effective default config for `PlaywrightEngineConfig.markdown`) applies to **both** internal engines.
- A per-request `markdown: true` option passed to `fetchHTML` **only applies if `HybridEngine` falls back to `PlaywrightEngine`**. `FetchEngine` always uses the constructor-defined `markdown` setting.

## Return Value: `HTMLFetchResult`

`fetchHTML()` resolves to an `HTMLFetchResult` object:

- **`content` (`string`):** The fetched content. Can be:
    - HTML.
    - Markdown (if conversion was enabled).
    - Raw string content of other text-based types like XML, JSON, or plain text (if `markdown: false` was effective for the fetch).
- **`contentType` (`'html' | 'markdown'`):** Indicates the format of the `content`.
    *Note: When fetching raw non-HTML text (e.g., XML, TXT with `markdown: false`), `contentType` will currently be `'html'` for type compatibility, even though `content` holds the true raw data.*
- **`title` (`string | null`):** Extracted page title (from original HTML, if applicable).
- **`url` (`string`):** Final URL after any redirects.
- **`isFromCache` (`boolean`):** `true` if the result was from cache.
- **`statusCode` (`number | undefined`):** HTTP status code.
- **`error` (`Error | undefined`):** Present if the fetch failed after all retries but some partial data might exist. Rely on thrown errors for primary failure handling.

## API Reference (Brief)

### `engine.fetchHTML(url, options?)`
- `url: string`: URL to fetch.
- `options?: FetchOptions`: Per-request overrides.
  - `markdown?: boolean`: (Playwright/Hybrid) Request Markdown. For Hybrid, only on Playwright fallback.
  - `fastMode?: boolean`: (Playwright/Hybrid) Override fast mode for this request.
- **Returns:** `Promise<HTMLFetchResult>`

## Error Handling

Errors are typically thrown as instances of `FetchError` (or subclasses), providing:
- `message: string`: Error description.
- `code?: string`: Specific error code (e.g., `ERR_NAVIGATION`, `ERR_HTTP_ERROR`).
- `originalError?: Error`: Underlying error.
- `statusCode?: number`: HTTP status if relevant.

**Common `PlaywrightEngine` / `HybridEngine` (Fallback) Error Codes:**
- `ERR_NAVIGATION`: General Playwright navigation error (e.g., timeout).
- `ERR_HTTP_ERROR`: Underlying page returned an HTTP error status (e.g. 404, 500) during Playwright navigation.
- `ERR_UNSUPPORTED_RAW_CONTENT_TYPE`: When `markdown: false`, the fetched resource was not a recognized raw text type (e.g., an image).
- `ERR_MARKDOWN_CONVERSION_NON_HTML`: When `markdown: true`, attempted to convert non-HTML content (e.g., XML, JSON).

**Common `FetchEngine` Error Codes:**
- `ERR_HTTP_ERROR` (subclass `FetchEngineHttpError`): Standard fetch failed with an HTTP error status.
- `ERR_NON_HTML_CONTENT`: Standard fetch received a non-HTML content type (and `markdown: false`).

See the example in the original README for detailed try/catch patterns.

## Advanced Topics

### Stealth / Anti-Detection (`PlaywrightEngine`)
`PlaywrightEngine` automatically uses `playwright-extra` and its stealth plugin. This helps the headless browser appear more like a regular one, bypassing many bot detections. No manual stealth configuration is needed. While effective, it's not foolproof.

### Cleanup
For `PlaywrightEngine` and `HybridEngine`, **it's crucial to call `await engine.cleanup()`** when done to release browser resources.
```typescript
// Example:
// await engine.cleanup();
```

## Contributing
Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## License
MIT

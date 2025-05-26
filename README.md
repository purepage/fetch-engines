# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`@purepageio/fetch-engines` simplifies fetching web content by providing robust, configurable, and easy-to-use engines. It offers a unified `fetchHTML(url, options?)` API to seamlessly retrieve content from both simple static HTML sites and complex, JavaScript-driven pages.

**Key Benefits:**

- **Flexible Fetching:** Choose `FetchEngine` for speed on static sites, or `HybridEngine` for robustness on dynamic sites (which uses a Playwright-based browser engine as a fallback).
- **Handles Complexity:** Manages JavaScript rendering, network errors, configurable retries, caching, and basic anti-bot measures automatically.
- **Optional Content Transformation:** Convert fetched HTML directly to clean Markdown.
- **TypeScript Ready:** Fully typed for an enhanced and safer development experience.

This package provides a high-level abstraction, letting you focus on *using* web content rather than the intricacies of fetching it.

## Installation

```bash
pnpm add @purepageio/fetch-engines
# or with npm
npm install @purepageio/fetch-engines
# or with yarn
yarn add @purepageio/fetch-engines
```

If you plan to use `HybridEngine` (which relies on Playwright for its browser-based fetching capabilities), you also need to install Playwright's browser binaries:

```bash
pnpm exec playwright install
# or
npx playwright install
```

## Engines

This library offers two primary engines:

- **`FetchEngine`**: Uses the standard `fetch` API. It's lightweight, fast, and ideal for static HTML pages or APIs where JavaScript execution isn't needed. This is your go-to for speed and efficiency.

- **`HybridEngine`**: A smart engine that first attempts fetching with `FetchEngine`. If that fails (e.g., due to errors, non-HTML content, or if `spaMode` detects a client-side rendered app), it automatically falls back to a powerful Playwright-based browser engine. This offers `FetchEngine`'s speed for simple sites and a browser's reliability for complex, dynamic ones. **`HybridEngine` is recommended for most general-purpose tasks.**

The browser-based functionality in `HybridEngine` is powered by an internal component using Playwright. Direct use of this component is generally not recommended; `HybridEngine` provides a more robust and user-friendly interface.

## Basic Usage

Both engines share a common `fetchHTML` method.

### FetchEngine

Use `FetchEngine` for fetching simple HTML pages quickly.

```typescript
import { FetchEngine } from "@purepageio/fetch-engines";

const engine = new FetchEngine();

async function fetchSimplePage() {
  try {
    const url = "https://example.com";
    const result = await engine.fetchHTML(url);
    console.log(`Successfully fetched: ${result.title}`);
    console.log(`Content type: ${result.contentType}`); // 'html'
    // Access HTML via result.content: console.log(result.content.substring(0, 200) + "...");
  } catch (error) {
    console.error("FetchEngine request failed:", error);
  }
}

fetchSimplePage();
```

### HybridEngine

Use `HybridEngine` for robustly fetching from diverse websites, including JavaScript-heavy ones. It intelligently switches between a simple fetch and a browser engine.

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

async function fetchAnyPage() {
  try {
    // Simple site (likely uses FetchEngine internally)
    const resultSimple = await engine.fetchHTML("https://example.com");
    console.log(`Successfully fetched: ${resultSimple.title}`);
    
    // Complex site (may use Playwright for browser rendering)
    // const resultComplex = await engine.fetchHTML("https://quotes.toscrape.com/js/");
    // console.log(`Successfully fetched: ${resultComplex.title}`);

  } catch (error) {
    console.error("HybridEngine request failed:", error);
  } finally {
    // CRITICAL: Always cleanup HybridEngine resources when done.
    await engine.cleanup();
  }
}

fetchAnyPage();
```

## Configuration

Engines can be configured by passing an options object to their constructor, allowing customization of their behavior.

### FetchEngine

`FetchEngine` accepts a `FetchEngineOptions` object. Key options include:

| Option     | Type                     | Default | Description                                                                                                |
| ---------- | ------------------------ | ------- | ---------------------------------------------------------------------------------------------------------- |
| `markdown` | `boolean`                | `false` | If `true`, converts fetched HTML to Markdown. `contentType` in the result will be set to `'markdown'`.      |
| `headers`  | `Record<string, string>` | `{}`    | Custom HTTP headers for the request. These can override the engine's default headers.                      |

```typescript
// Example: FetchEngine with Markdown and custom User-Agent
const customFetchEngine = new FetchEngine({
  markdown: true,
  headers: { "User-Agent": "MyCustomAgent/1.0" },
});
```

### `HybridEngine` (using `PlaywrightEngineConfig`)

`HybridEngine` accepts a `PlaywrightEngineConfig` object, which configures its overall behavior, including its internal `FetchEngine` and the Playwright-based browser engine. Common options include:

| Option                       | Type                     | Default     | Description                                                                                                                               |
| ---------------------------- | ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `headers`                    | `Record<string, string>` | `{}`        | Custom HTTP headers for all requests (both direct fetch and browser-based).                                                               |
| `markdown`                   | `boolean`                | `false`     | Default setting for HTML to Markdown conversion.                                                                                          |
| `spaMode`                    | `boolean`                | `false`     | Optimizes for Single Page Applications (e.g., disables HTTP fallback, uses more patient load conditions).                                |
| `cacheTTL`                   | `number`                 | `900000`    | Cache Time-To-Live in milliseconds for fetched content (15 mins default). `0` disables caching.                                            |
| `maxRetries`                 | `number`                 | `3`         | Maximum retry attempts for a failed fetch (excluding the initial try).                                                                    |
| `retryDelay`                 | `number`                 | `5000`      | Delay in milliseconds between retries (5 seconds default).                                                                                 |
| `playwrightLaunchOptions`    | `object`                 | `undefined` | Playwright browser launch options (e.g., `{ args: ['--disable-gpu'] }`). Passed when a browser instance is created.                      |
| `maxBrowsers`                | `number`                 | `2`         | Maximum concurrent browser instances managed by the internal resource pool.                                                                   |
| `poolBlockedResourceTypes`   | `string[]`               | `[]`        | List of Playwright resource types (e.g., 'image', 'font') to block, potentially speeding up page loads.                                    |
| `useHttpFallback`            | `boolean`                | `true`      | (For Playwright part) If `true`, attempts a fast HTTP fetch before using a full browser. Ineffective if `spaMode` is `true`.               |
| `defaultFastMode`            | `boolean`                | `true`      | If `true`, initially blocks non-essential resources and uses simpler interaction patterns. Effectively `false` if `spaMode` is `true`. |

```typescript
// Example: HybridEngine with SPA mode, custom cache, and blocked resource types
const spaHybridEngine = new HybridEngine({ 
  spaMode: true, 
  cacheTTL: 600000, // 10 minutes
  poolBlockedResourceTypes: ['image', 'font']
});
```

**Note on Advanced Options:**

The tables above list frequently used configuration options. Both `FetchEngineOptions` and particularly `PlaywrightEngineConfig` (for `HybridEngine`) provide many more advanced settings for fine-grained control over aspects like browser pooling, specific timeouts, request interception, human-like interaction simulation, and more.

For a complete and exhaustive list of all available options and their default values, please refer to the project's TypeScript type definitions (e.g., `FetchEngineOptions.ts`, `PlaywrightEngineConfig.ts`) or the source code directly.

## Return Value

The `fetchHTML()` method returns a Promise resolving to an `HTMLFetchResult` object with:

- `content` (`string`): Fetched HTML or Markdown content.
- `contentType` (`'html' | 'markdown'`): Format of `content`.
- `title` (`string | null`): Extracted page title.
- `url` (`string`): Final URL after redirects.
- `isFromCache` (`boolean`): If the result is from cache.
- `statusCode` (`number | undefined`): HTTP status code.

For error details, see the "Error Handling" section.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): The URL to fetch.
- `options?` (`FetchOptions`): Optional per-request configurations (e.g., custom headers). See "Configuration" or type definitions for details.
- **Returns:** `Promise<HTMLFetchResult>`

Fetches web content, returning a promise with an `HTMLFetchResult`.

### `engine.cleanup()`

- **Returns:** `Promise<void>`

Gracefully shuts down resources like browser instances in `HybridEngine`. **Crucial to call `await engine.cleanup()` for `HybridEngine`** to prevent leaks. It's a no-op for `FetchEngine`.

## Stealth / Anti-Detection (via `HybridEngine`)

When `HybridEngine` uses its browser-based fetching, stealth features are automatically enabled to help bypass common bot detection. These are applied by default. While effective, no stealth technique is foolproof.

## Error Handling

Failed fetches (after retries) throw a `FetchError` (or subclass). `FetchError` instances include:

- `message` (`string`): Error description.
- `code` (`string | undefined`): Specific error code (e.g., `ERR_HTTP_ERROR`).
- `statusCode` (`number | undefined`): HTTP status code if relevant (e.g., 404).
- `originalError` (`Error | undefined`): Underlying cause.

Common error codes:
- `ERR_HTTP_ERROR`: HTTP status >= 400.
- `ERR_NAVIGATION`: Navigation failure (e.g., DNS, timeout).
- `ERR_NON_HTML_CONTENT`: `FetchEngine` expected HTML but got other content.
- `ERR_PLAYWRIGHT_OPERATION`: Error during `HybridEngine`'s browser operation.

Handle errors with a try-catch block:

```typescript
import { HybridEngine, FetchError } from "@purepageio/fetch-engines";

const engine = new HybridEngine(); // Or FetchEngine

async function fetchMyUrl(url: string) {
  try {
    const result = await engine.fetchHTML(url);
    console.log(`Fetched: ${result.title}`);
    // Use result.content
  } catch (error) {
    console.error(`Fetch failed for ${url}:`);
    if (error instanceof FetchError) {
      console.error(`  Message: ${error.message}`);
      if (error.code) console.error(`  Code: ${error.code}`);
      if (error.statusCode) console.error(`  Status Code: ${error.statusCode}`);
      // For detailed debugging, inspect error.originalError
    } else {
      console.error(`  An unexpected error: ${error.message}`);
    }
  } finally {
    // Important for HybridEngine to release browser resources
    if (engine instanceof HybridEngine) {
      await engine.cleanup();
    }
  }
}

// fetchMyUrl("https://example.com");
```
For a full list of error codes, see the source code or type definitions.

## Logging

The library uses `console.warn` and `console.error` for internal operational messages.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/purepageio/fetch-engines).

## License

MIT

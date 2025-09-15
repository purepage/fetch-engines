# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fetching web content can be complex. You need to handle static HTML, dynamic JavaScript-driven sites, network errors, retries, caching, and potential bot detection measures. Managing browser automation tools like Playwright adds another layer of complexity with resource pooling and stealth configurations.

`@purepageio/fetch-engines` simplifies this entire process by providing a set of robust, configurable, and easy-to-use engines for retrieving web page content.

**Why use `@purepageio/fetch-engines`?**

- **Unified API:** Get content from simple or complex sites using the same `fetchHTML(url, options?)` method for processed content or `fetchContent(url, options?)` for raw content.
- **Flexible Strategies:** Choose the right tool for the job:
  - `FetchEngine`: Lightweight and fast for static HTML, using the standard `fetch` API. Ideal for speed and efficiency with content that doesn't require JavaScript rendering. Supports custom headers.
  - `HybridEngine`: The best of both worlds – tries `FetchEngine` first for speed, automatically falls back to a powerful browser engine (internally, `PlaywrightEngine`) for reliability on complex, JavaScript-heavy pages. Supports custom headers.
- **Raw Content Support:** Use `fetchContent()` to retrieve any type of content (PDFs, images, APIs, etc.) with the same smart fallback logic as `fetchHTML()`.
- **Robust & Resilient:** Built-in caching, configurable retries, and standardized error handling make your fetching logic more dependable.
- **Simplified Automation:** When `HybridEngine` uses its browser capabilities (via the internal `PlaywrightEngine`), it manages browser instances and contexts automatically through efficient pooling and includes integrated stealth measures to bypass common anti-bot systems.
- **Content Transformation:** Optionally convert fetched HTML directly to clean Markdown content.
- **TypeScript Ready:** Fully typed for a better development experience.

This package provides a high-level abstraction, letting you focus on using the web content rather than the intricacies of fetching it.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Engines](#engines)
- [Basic Usage](#basic-usage)
- [fetchHTML vs fetchContent](#fetchhtml-vs-fetchcontent)
- [Structured Content Extraction](#structured-content-extraction)
- [Configuration](#configuration)
- [Return Value](#return-value)
- [API Reference](#api-reference)
- [Stealth / Anti-Detection (`PlaywrightEngine`)](#stealth--anti-detection-playwrightengine)
- [Error Handling](#error-handling)
- [Logging](#logging)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Multiple Fetching Strategies:** Choose between `FetchEngine` (lightweight `fetch`) or `HybridEngine` (smart fallback to a full browser engine).
- **Unified API:** Simple `fetchHTML(url, options?)` interface for processed content and `fetchContent(url, options?)` for raw content across both primary engines.
- **Raw Content Fetching:** Use `fetchContent()` to retrieve any type of content (PDFs, images, JSON, XML, etc.) without HTML processing or content-type restrictions.
- **AI-Powered Structured Data Extraction:** Use `fetchStructuredContent()` to automatically extract structured data from web pages using AI and Zod schemas.
- **Custom Headers:** Easily provide custom HTTP headers for requests in both `FetchEngine` and `HybridEngine`.
- **Configurable Retries:** Automatic retries on failure with customizable attempts and delays.
- **Built-in Caching:** In-memory caching with configurable TTL to reduce redundant fetches.
- **Playwright Stealth:** When `HybridEngine` utilizes its browser capabilities, it automatically integrates `playwright-extra` and stealth plugins to bypass common bot detection.
- **Managed Browser Pooling:** Efficient resource management for `HybridEngine`'s browser mode with configurable browser/context limits and lifecycles.
- **Smart Fallbacks:** `HybridEngine` uses `FetchEngine` first, falling back to its internal browser engine only when needed. The internal browser engine can also optionally use a fast HTTP fetch before launching a full browser.
- **Content Conversion:** Optionally convert fetched HTML directly to Markdown, preserving `<table>` elements even without header rows.
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

If you plan to use the `HybridEngine` (which internally uses Playwright for advanced fetching), you also need to install Playwright's browser binaries:

```bash
pnpm exec playwright install
# or
npx playwright install
```

## Engines

- **`FetchEngine`**: Uses the standard `fetch` API. Suitable for simple HTML pages or APIs returning HTML. Lightweight and fast. This is your go-to for speed and efficiency when JavaScript rendering is not required.
- **`HybridEngine`**: A smart combination. It first attempts to fetch content using the lightweight `FetchEngine`. If that fails for _any_ reason (e.g., network error, non-HTML content, HTTP error like 403), or if `spaMode` is enabled and an SPA shell is detected, it automatically falls back to using an internal, powerful browser engine (based on Playwright). This provides the speed of `FetchEngine` for simple sites while retaining the power of a full browser for complex, dynamic websites. This is recommended for most general-purpose fetching tasks.
- **`PlaywrightEngine` (Internal Component)**: While not recommended for direct use by most users, `PlaywrightEngine` is the component `HybridEngine` uses internally for its browser-based fetching. It manages Playwright browser instances, contexts, and stealth features. Users needing direct, low-level control over Playwright might consider it, but `HybridEngine` offers a more robust and flexible approach for most scenarios.

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

### HybridEngine

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

// Engine configured to fetch HTML by default for its internal engines
// and provide some custom headers for all requests made by HybridEngine.
const engine = new HybridEngine({
  markdown: false,
  headers: { "X-Global-Custom-Header": "HybridGlobalValue" },
  // Other PlaywrightEngine specific configs can be set here for the fallback mechanism
  // e.g., playwrightLaunchOptions: { args: ["--disable-gpu"] }
});

async function main() {
  try {
    const urlSimple = "https://example.com"; // Simple site, likely handled by FetchEngine
    const urlComplex = "https://quotes.toscrape.com/"; // JS-heavy site, likely requiring Playwright fallback

    // --- Scenario 1: FetchEngine part of HybridEngine handles it ---
    console.log(`\nFetching simple site (${urlSimple}) with per-request headers...`);
    const result1 = await engine.fetchHTML(urlSimple, {
      headers: { "X-Request-Specific": "SimpleRequestValue" },
    });
    // FetchEngine (via HybridEngine) will use:
    // 1. Its base default headers (User-Agent etc.)
    // 2. Overridden/augmented by HybridEngine's constructor headers ("X-Global-Custom-Header")
    // 3. Overridden/augmented by per-request headers ("X-Request-Specific")
    console.log(`Fetched ${result1.url} (ContentType: ${result1.contentType}) - Title: ${result1.title}`);
    console.log(`Content (HTML): ${result1.content.substring(0, 100)}...`);

    // --- Scenario 2: Playwright part of HybridEngine handles it ---
    console.log(`\nFetching complex site (${urlComplex}) requesting Markdown and with per-request headers...`);
    const result2 = await engine.fetchHTML(urlComplex, {
      markdown: true,
      headers: { "X-Request-Specific": "ComplexRequestValue", "X-Another": "ComplexAnother" },
    });
    // PlaywrightEngine (via HybridEngine) will use:
    // 1. Its base default headers (User-Agent etc. if doing HTTP fallback, or for page.setExtraHTTPHeaders)
    // 2. Overridden/augmented by HybridEngine's constructor headers ("X-Global-Custom-Header")
    // 3. Overridden/augmented by per-request headers ("X-Request-Specific", "X-Another")
    // The markdown: true option will be respected by the Playwright part.
    console.log(`Fetched ${result2.url} (ContentType: ${result2.contentType}) - Title: ${result2.title}`);
    console.log(`Content (Markdown):\n${result2.content.substring(0, 300)}...`);
  } catch (error) {
    console.error("Hybrid fetch failed:", error);
  } finally {
    await engine.cleanup(); // Important for HybridEngine
  }
}
main();
```

### Raw Content Fetching

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

async function fetchRawContent() {
  try {
    // Fetch a PDF document
    const pdfResult = await engine.fetchContent("https://example.com/document.pdf");
    console.log(`PDF Content-Type: ${pdfResult.contentType}`);
    console.log(
      `PDF Size: ${Buffer.isBuffer(pdfResult.content) ? pdfResult.content.length : pdfResult.content.length} bytes`
    );

    // Fetch JSON API
    const jsonResult = await engine.fetchContent("https://api.example.com/data");
    console.log(`JSON Content-Type: ${jsonResult.contentType}`);
    console.log(`JSON Data: ${typeof jsonResult.content === "string" ? jsonResult.content : "Binary data"}`);

    // Fetch with custom headers
    const customResult = await engine.fetchContent("https://protected-api.example.com/data", {
      headers: {
        Authorization: "Bearer your-token",
        Accept: "application/json",
      },
    });
    console.log(`Custom fetch result: ${customResult.statusCode}`);
  } catch (error) {
    console.error("Raw content fetch failed:", error);
  } finally {
    await engine.cleanup();
  }
}
fetchRawContent();
```

## fetchHTML vs fetchContent

Choose the right method for your use case:

### `fetchHTML(url, options?)`

**Use when:** You want to extract and process web page content.

**Features:**

- Processes HTML content and extracts metadata (title, etc.)
- Supports HTML-to-Markdown conversion
- Optimized for web page content
- Content-type restrictions (HTML/XML only)
- Returns processed content as `string`

**Best for:**

- Web scraping
- Content extraction
- Blog/article processing
- Any scenario where you need structured HTML or Markdown

### `fetchContent(url, options?)`

**Use when:** You want raw content without processing, mimicking standard `fetch()` behavior.

**Features:**

- Retrieves any content type (PDFs, images, JSON, XML, etc.)
- No content-type restrictions
- Returns raw content as `Buffer` (binary) or `string` (text)
- Preserves original MIME type information
- Minimal processing overhead

**Best for:**

- API consumption
- File downloads (PDFs, images, etc.)
- Binary content retrieval
- Any scenario where you need the raw response

### Example Comparison

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

// fetchHTML - for web page content
const htmlResult = await engine.fetchHTML("https://example.com");
console.log(htmlResult.title); // "Example Domain"
console.log(htmlResult.contentType); // "html" or "markdown"
console.log(typeof htmlResult.content); // "string" (processed HTML/Markdown)

// fetchContent - for raw content
const contentResult = await engine.fetchContent("https://example.com");
console.log(contentResult.title); // "Example Domain" (extracted but not processed)
console.log(contentResult.contentType); // "text/html" (original MIME type)
console.log(typeof contentResult.content); // "string" (raw HTML)

// fetchContent - for non-HTML content
const pdfResult = await engine.fetchContent("https://example.com/doc.pdf");
console.log(pdfResult.contentType); // "application/pdf"
console.log(Buffer.isBuffer(pdfResult.content)); // true (binary content)
```

## Structured Content Extraction

The `fetchStructuredContent` function combines web scraping with AI-powered data extraction. It fetches content from a URL, converts it to markdown, and then uses OpenAI's models to extract structured data according to a Zod schema.

### Prerequisites

You need to set the `OPENAI_API_KEY` environment variable:

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### Basic Usage

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";
import { z } from "zod";

// Define the structure you want to extract
const articleSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  summary: z.string(),
  tags: z.array(z.string()),
});

async function extractArticleData() {
  try {
    const result = await fetchStructuredContent(
      "https://example.com/article",
      articleSchema,
      {
        model: 'gpt-4.1-mini', // Optional: specify model (default: 'gpt-5-mini')
        customPrompt: 'Extract the main article information, focusing on accuracy',
      }
    );

    console.log('Extracted data:', result.data);
    console.log('Page title:', result.title);
    console.log('Token usage:', result.usage);
  } catch (error) {
    console.error('Extraction failed:', error);
  }
}
```

### Using StructuredContentEngine Class

For more control and reuse, use the `StructuredContentEngine` class:

```typescript
import { StructuredContentEngine } from "@purepageio/fetch-engines";
import { z } from "zod";

const productSchema = z.object({
  name: z.string(),
  price: z.number(),
  description: z.string(),
  inStock: z.boolean(),
  specifications: z.record(z.string()),
});

const engine = new StructuredContentEngine({
  // HybridEngine configuration options
  spaMode: true,
  spaRenderDelayMs: 2000,
});

async function extractProducts() {
  try {
    const result = await engine.fetchStructuredContent(
      "https://shop.example.com/product/123",
      productSchema,
      {
        model: 'gpt-4.1',
        customPrompt: 'Focus on extracting accurate pricing and availability',
      }
    );

    console.log('Product data:', result.data);
    // result.data is fully typed according to your schema
    console.log(`${result.data.name} costs $${result.data.price}`);
  } catch (error) {
    console.error('Failed to extract product data:', error);
  } finally {
    await engine.cleanup(); // Important: clean up resources
  }
}
```

### Supported Models

You can specify which OpenAI model to use:

- `'gpt-4.1-mini'` - Fast and cost-effective (uses `temperature: 0`)
- `'gpt-4.1'` - More capable version (uses `temperature: 0`)
- `'gpt-5-mini'` - Latest model, mini version (uses `reasoning_effort: 'low'`) **[Default]**
- `'gpt-5'` - Most capable model (uses `reasoning_effort: 'low'`)

```typescript
// Example with different models
const result1 = await fetchStructuredContent(url, schema, { model: 'gpt-4.1-mini' });
const result2 = await fetchStructuredContent(url, schema, { model: 'gpt-5' });
```

### Complex Schema Example

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";
import { z } from "zod";

const restaurantSchema = z.object({
  name: z.string(),
  cuisine: z.string(),
  rating: z.number().min(0).max(5),
  priceRange: z.enum(['$', '$$', '$$$', '$$$$']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  menu: z.array(z.object({
    category: z.string(),
    items: z.array(z.object({
      name: z.string(),
      price: z.number(),
      description: z.string().optional(),
    })),
  })),
  hours: z.record(z.string()), // day -> hours
  contact: z.object({
    phone: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
  }),
});

async function extractRestaurantInfo() {
  const result = await fetchStructuredContent(
    "https://restaurant.example.com",
    restaurantSchema,
    {
      model: 'gpt-4.1',
      customPrompt: 'Extract comprehensive restaurant information including full menu details',
    }
  );

  // Fully typed result
  console.log(`${result.data.name} - ${result.data.cuisine} cuisine`);
  console.log(`Rating: ${result.data.rating}/5, Price: ${result.data.priceRange}`);
  console.log(`Menu categories: ${result.data.menu.map(cat => cat.category).join(', ')}`);
}
```

### Error Handling

The function throws an error if:
- `OPENAI_API_KEY` is not set
- The URL cannot be fetched
- Content cannot be converted to markdown
- AI fails to extract structured data
- The extracted data doesn't match the schema

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";

try {
  const result = await fetchStructuredContent(url, schema);
  // Use result.data
} catch (error) {
  if (error.message.includes('OPENAI_API_KEY')) {
    console.error('Please set your OpenAI API key');
  } else if (error.message.includes('Failed to extract structured data')) {
    console.error('AI extraction failed:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Configuration

Engines accept an optional configuration object in their constructor to customise behavior.

### FetchEngine

The `FetchEngine` accepts a `FetchEngineOptions` object with the following properties:

| Option     | Type                     | Default | Description                                                                                                                                                                    |
| ---------- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `markdown` | `boolean`                | `false` | If `true`, converts fetched HTML to Markdown. `contentType` in the result will be set to `'markdown'`.                                                                         |
| `headers`  | `Record<string, string>` | `{}`    | Custom HTTP headers to be sent with the request. These are merged with and can override the engine's default headers. Headers from `fetchHTML` options take higher precedence. |

```typescript
// Example: FetchEngine with custom headers and Markdown conversion
const customFetchEngine = new FetchEngine({
  markdown: true,
  headers: {
    "User-Agent": "MyCustomFetchAgent/1.0",
    "X-Api-Key": "your-api-key",
  },
});
```

#### Header Precedence for `FetchEngine`:

1.  Headers passed in `fetchHTML(url, { headers: { ... } })` (highest precedence).
2.  Headers passed in the `FetchEngine` constructor `new FetchEngine({ headers: { ... } })`.
3.  Default headers of the `FetchEngine` (e.g., its default `User-Agent`) (lowest precedence).

### `PlaywrightEngineConfig` (Used by `HybridEngine`)

The `HybridEngine` constructor accepts a `PlaywrightEngineConfig` object. These settings configure the underlying `FetchEngine` and `PlaywrightEngine` (for fallback scenarios) and the hybrid strategy itself. When using `HybridEngine`, you are essentially configuring how it will behave and how its internal Playwright capabilities will operate if needed.

**Key Options for `HybridEngine` (from `PlaywrightEngineConfig`):**

| Option                    | Type                     | Default     | Description                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers`                 | `Record<string, string>` | `{}`        | Custom HTTP headers. For `HybridEngine`, these serve as default headers for both its internal `FetchEngine` (constructor) and `PlaywrightEngine` (constructor). They can be overridden by headers in `HybridEngine.fetchHTML()` options.                              |
| `markdown`                | `boolean`                | `false`     | Default Markdown conversion. For `HybridEngine`: sets default for internal `FetchEngine` (constructor) and internal `PlaywrightEngine`. Can be overridden per-request for the `PlaywrightEngine` part.                                                                |
| `useHttpFallback`         | `boolean`                | `true`      | (For Playwright part) If `true`, attempts a fast HTTP fetch before using Playwright. Ineffective if `spaMode` is `true`.                                                                                                                                              |
| `useHeadedModeFallback`   | `boolean`                | `false`     | (For Playwright part) If `true`, automatically retries specific failed Playwright attempts in headed (visible) mode.                                                                                                                                                  |
| `defaultFastMode`         | `boolean`                | `true`      | If `true`, initially blocks non-essential resources and skips human simulation. Can be overridden per-request. Effectively `false` if `spaMode` is `true`.                                                                                                            |
| `simulateHumanBehavior`   | `boolean`                | `true`      | If `true` (and not `fastMode` or `spaMode`), attempts basic human-like interactions.                                                                                                                                                                                  |
| `concurrentPages`         | `number`                 | `3`         | Max number of pages to process concurrently within the engine queue.                                                                                                                                                                                                  |
| `maxRetries`              | `number`                 | `3`         | Max retry attempts for a failed fetch (excluding initial try).                                                                                                                                                                                                        |
| `retryDelay`              | `number`                 | `5000`      | Delay (ms) between retries.                                                                                                                                                                                                                                           |
| `cacheTTL`                | `number`                 | `900000`    | Cache Time-To-Live (ms). `0` disables caching. (15 mins default)                                                                                                                                                                                                      |
| `spaMode`                 | `boolean`                | `false`     | If `true`, enables Single Page Application mode. This typically bypasses `useHttpFallback`, effectively sets `fastMode` to `false`, uses more patient load conditions (e.g., network idle), and may apply `spaRenderDelayMs`. Recommended for JavaScript-heavy sites. |
| `spaRenderDelayMs`        | `number`                 | `0`         | Explicit delay (ms) after page load events in `spaMode` to allow for client-side rendering. Only applies if `spaMode` is `true`.                                                                                                                                      |
| `playwrightLaunchOptions` | `LaunchOptions`          | `undefined` | (For Playwright part) Optional Playwright launch options (from `playwright` package, e.g., `{ args: ['--some-flag'] }`) passed when a browser instance is created. Merged with internal defaults.                                                                     |

**Browser Pool Options (For `HybridEngine`'s internal `PlaywrightEngine`):**

| Option                     | Type                       | Default     | Description                                                                                 |
| -------------------------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `maxBrowsers`              | `number`                   | `2`         | Max concurrent browser instances managed by the pool.                                       |
| `maxPagesPerContext`       | `number`                   | `6`         | Max pages per browser context before recycling.                                             |
| `maxBrowserAge`            | `number`                   | `1200000`   | Max age (ms) a browser instance lives before recycling. (20 mins default)                   |
| `healthCheckInterval`      | `number`                   | `60000`     | How often (ms) the pool checks browser health. (1 min default)                              |
| `useHeadedMode`            | `boolean`                  | `false`     | Forces the _entire pool_ (for Playwright part) to launch browsers in headed (visible) mode. |
| `poolBlockedDomains`       | `string[]`                 | `[]`        | List of domain glob patterns to block requests to (for Playwright part).                    |
| `poolBlockedResourceTypes` | `string[]`                 | `[]`        | List of Playwright resource types (e.g., 'image', 'font') to block (for Playwright part).   |
| `proxy`                    | `{ server: string, ... }?` | `undefined` | Proxy configuration object (see `PlaywrightEngineConfig` type) (for Playwright part).       |

### `HybridEngine` - Configuration Summary & Header Precedence

When you configure `HybridEngine` using `PlaywrightEngineConfig`:

- **`headers`**: Constructor headers are passed to the internal `FetchEngine`'s constructor and the internal `PlaywrightEngine`'s constructor.
- **`markdown`**: Sets the default for both internal engines.
- **`spaMode`**: Sets the default for `HybridEngine`'s SPA shell detection and for the internal `PlaywrightEngine`.
- Other options primarily configure the internal `PlaywrightEngine` or general retry/caching logic.

**Per-request `options` in `HybridEngine.fetchHTML(url, options)`:**

- **`headers?: Record<string, string>`**:
  - These headers override any headers set in the `HybridEngine` constructor.
  - If `FetchEngine` is used: These headers are passed to `FetchEngine.fetchHTML(url, { headers: ... })`. `FetchEngine` then merges them with its constructor headers and base defaults.
  - If `PlaywrightEngine` (fallback) is used: These headers are merged with `HybridEngine` constructor headers (options take precedence) and the result is passed to `PlaywrightEngine`'s `fetchHTML()`. `PlaywrightEngine` then applies its own logic (e.g., for `page.setExtraHTTPHeaders` or its HTTP fallback).
- **`markdown?: boolean`**:
  - If `FetchEngine` is used: This per-request option is **ignored**. `FetchEngine` uses its own constructor `markdown` setting.
  - If `PlaywrightEngine` (fallback) is used: This overrides `PlaywrightEngine`'s default and determines its output format.
- **`spaMode?: boolean`**: Overrides `HybridEngine`'s default SPA mode and is passed to `PlaywrightEngine` if used.
- **`fastMode?: boolean`**: Passed to `PlaywrightEngine` if used; no effect on `FetchEngine`.

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

### `fetchHTML()` Result

All `fetchHTML()` methods return a Promise that resolves to an `HTMLFetchResult` object:

- `content` (`string`): The fetched content, either original HTML or converted Markdown.
- `contentType` (`'html' | 'markdown'`): Indicates the format of the `content` string.
- `title` (`string | null`): Extracted page title (from original HTML).
- `url` (`string`): Final URL after redirects.
- `isFromCache` (`boolean`): True if the result came from cache.
- `statusCode` (`number | undefined`): HTTP status code.
- `error` (`Error | undefined`): Error object if the fetch failed after all retries. It's generally recommended to rely on catching thrown errors for failure handling.

### `fetchContent()` Result

All `fetchContent()` methods return a Promise that resolves to a `ContentFetchResult` object:

- `content` (`Buffer | string`): The raw fetched content. Binary content (PDFs, images, etc.) is returned as `Buffer`, text content as `string`.
- `contentType` (`string`): The original MIME type from the server (e.g., `"application/pdf"`, `"text/html"`, `"application/json"`).
- `title` (`string | null`): Extracted page title if the content is HTML, otherwise `null`.
- `url` (`string`): Final URL after redirects.
- `isFromCache` (`boolean`): True if the result came from cache.
- `statusCode` (`number | undefined`): HTTP status code.
- `error` (`Error | undefined`): Error object if the fetch failed after all retries. It's generally recommended to rely on catching thrown errors for failure handling.

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): URL to fetch.
- `options?` (`FetchOptions`): Optional per-request overrides.
  - `headers?: Record<string, string>`: Custom headers for this specific request.
  - `markdown?: boolean`: (For `HybridEngine`'s Playwright part) Request Markdown conversion.
  - `fastMode?: boolean`: (For `HybridEngine`'s Playwright part) Override fast mode.
  - `spaMode?: boolean`: (For `HybridEngine`) Override SPA mode behavior for this request.
- **Returns:** `Promise<HTMLFetchResult>`

Fetches content, returning HTML or Markdown based on configuration/options in `result.content` with `result.contentType` indicating the format.

### `engine.fetchContent(url, options?)`

- `url` (`string`): URL to fetch.
- `options?` (`ContentFetchOptions`): Optional per-request overrides.
  - `headers?: Record<string, string>`: Custom headers for this specific request.
- **Returns:** `Promise<ContentFetchResult>`

Fetches raw content without processing, mimicking standard `fetch()` behavior. Returns binary content as `Buffer` and text content as `string`. Supports any content type (PDFs, images, JSON, XML, etc.) and uses the same smart fallback logic as `fetchHTML()` but without HTML-specific processing or content-type restrictions.

### `fetchStructuredContent(url, schema, options?)`

- `url` (`string`): URL to fetch and extract data from.
- `schema` (`z.ZodSchema<T>`): Zod schema defining the structure of data to extract.
- `options?` (`StructuredContentOptions`): Optional configuration.
  - `model?: 'gpt-4.1-mini' | 'gpt-4.1' | 'gpt-5' | 'gpt-5-mini'`: OpenAI model to use (default: `'gpt-5-mini'`).
  - `customPrompt?: string`: Additional context for the AI extraction.
  - `engineConfig?: PlaywrightEngineConfig`: Configuration for the underlying HybridEngine.
- **Returns:** `Promise<StructuredContentResult<T>>`

Convenience function for one-off structured content extraction. Fetches content, converts to markdown, and uses AI to extract structured data according to the provided schema. Requires `OPENAI_API_KEY` environment variable.

### `StructuredContentEngine.fetchStructuredContent(url, schema, options?)`

- `url` (`string`): URL to fetch and extract data from.
- `schema` (`z.ZodSchema<T>`): Zod schema defining the structure of data to extract.
- `options?` (`StructuredContentOptions`): Optional configuration (same as above).
- **Returns:** `Promise<StructuredContentResult<T>>`

Instance method for structured content extraction with reusable engine. More efficient for multiple extractions as it reuses the underlying HybridEngine instance.

### `engine.cleanup()` (`HybridEngine`, `StructuredContentEngine`, and `FetchEngine`)

- **Returns:** `Promise<void>`

For `HybridEngine` and `StructuredContentEngine`, this gracefully shuts down all browser instances managed by the internal `PlaywrightEngine`. **It is crucial to call `await engine.cleanup()` when you are finished using these engines** to release system resources.
`FetchEngine` has a `cleanup` method for API consistency, but it's a no-op as `FetchEngine` doesn't manage persistent resources.

## Stealth / Anti-Detection (via `HybridEngine`)

When `HybridEngine` uses its internal browser capabilities (via `PlaywrightEngine`), it automatically integrates `playwright-extra` and its powerful stealth plugin ([`puppeteer-extra-plugin-stealth`](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)). This plugin applies various techniques to make the headless browser controlled by Playwright appear more like a regular human-operated browser, helping to bypass many common bot detection systems.

There are **no manual configuration options** for stealth; it is enabled by default when `HybridEngine` uses its browser functionality.

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
- **`ERR_NON_HTML_CONTENT`**: Thrown by `FetchEngine` if the content type is not HTML and `markdown` conversion is not requested. **Note:** `fetchContent()` does not throw this error as it supports all content types.
- **`ERR_PLAYWRIGHT_OPERATION`**: A general error from `HybridEngine`'s browser mode indicating a failure during a Playwright operation (e.g., page acquisition, navigation, interaction). The `originalError` property will often contain the specific Playwright error.
- **`ERR_NAVIGATION`**: Often seen as part of `ERR_PLAYWRIGHT_OPERATION`'s message or in `originalError` when a Playwright navigation (in `HybridEngine`'s browser mode) fails (e.g., timeout, SSL error).
- **`ERR_MARKDOWN_CONVERSION_NON_HTML`**: Thrown by `HybridEngine` (when its Playwright part is active) if `markdown: true` is requested for a non-HTML content type (e.g., XML, JSON). **Note:** Only applies to `fetchHTML()` as `fetchContent()` doesn't perform markdown conversion.
- **`ERR_CACHE_ERROR`**: Indicates an issue with cache read/write operations.
- **`ERR_PROXY_CONFIG_ERROR`**: Problem with proxy configuration (for `HybridEngine`'s browser mode).
- **`ERR_BROWSER_POOL_EXHAUSTED`**: If `HybridEngine`'s browser pool cannot provide a page.
- **Other Scenarios (often wrapped by `ERR_PLAYWRIGHT_OPERATION` or a generic `FetchError` when `HybridEngine` uses its browser mode):**
  - Network issues (DNS resolution, connection refused).
  - Proxy connection failures.
  - Page crashes or context/browser disconnections within Playwright.
  - Failures during browser launch or management by the pool.

The `HTMLFetchResult` object may also contain an `error` property if the final fetch attempt failed after all retries but an earlier attempt (within retries) might have produced some intermediate (potentially unusable) result data. It's generally best to rely on the thrown error for failure handling.

**Example:**

```typescript
import { HybridEngine, FetchError } from "@purepageio/fetch-engines";

// Example using HybridEngine to illustrate error handling
const engine = new HybridEngine({ useHttpFallback: false, maxRetries: 1 }); // useHttpFallback for Playwright part

async function fetchWithHandling(url: string) {
  try {
    // Try fetchHTML first
    const htmlResult = await engine.fetchHTML(url, { headers: { "X-My-Header": "TestValue" } });
    if (htmlResult.error) {
      console.warn(`fetchHTML for ${url} included non-critical error after retries: ${htmlResult.error.message}`);
    }
    console.log(`fetchHTML Success for ${url}! Title: ${htmlResult.title}, Content type: ${htmlResult.contentType}`);
    // Use htmlResult.content
  } catch (error) {
    console.error(`fetchHTML failed for ${url}, trying fetchContent...`);

    try {
      // Fallback to fetchContent for raw content
      const contentResult = await engine.fetchContent(url, { headers: { "X-My-Header": "TestValue" } });
      if (contentResult.error) {
        console.warn(
          `fetchContent for ${url} included non-critical error after retries: ${contentResult.error.message}`
        );
      }
      console.log(`fetchContent Success for ${url}! Content type: ${contentResult.contentType}`);
      // Use contentResult.content (could be Buffer or string)
    } catch (contentError) {
      console.error(`Both fetchHTML and fetchContent failed for ${url}:`);
      if (contentError instanceof FetchError) {
        console.error(`  Error Code: ${contentError.code || "N/A"}`);
        console.error(`  Message: ${contentError.message}`);
        if (contentError.statusCode) {
          console.error(`  Status Code: ${contentError.statusCode}`);
        }
        if (contentError.originalError) {
          console.error(`  Original Error: ${contentError.originalError.name} - ${contentError.originalError.message}`);
        }
        // Example of specific handling:
        if (contentError.code === "ERR_PLAYWRIGHT_OPERATION") {
          console.error(
            "  Hint: This was a Playwright operation failure (HybridEngine's browser mode). Check Playwright logs or originalError."
          );
        }
      } else if (contentError instanceof Error) {
        console.error(`  Generic Error: ${contentError.message}`);
      } else {
        console.error(`  Unknown error occurred: ${String(contentError)}`);
      }
    }
  }
}

async function runExamples() {
  await fetchWithHandling("https://nonexistentdomain.example.com"); // Likely DNS or navigation error
  await fetchWithHandling("https://example.com/document.pdf"); // PDF content - fetchHTML will fail, fetchContent will succeed
  await fetchWithHandling("https://example.com/api/data.json"); // JSON content - fetchHTML will fail, fetchContent will succeed
  await engine.cleanup(); // Important for HybridEngine
}

runExamples();
```

## Logging

Currently, the library uses `console.warn` and `console.error` for internal warnings (like fallback events) and critical errors. More sophisticated logging options may be added in the future.

## Testing

To run the test suite locally:

```bash
pnpm install
pnpm exec playwright install
pnpm test
```

The `pnpm exec playwright install` step downloads the required browser binaries for Playwright.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on the [GitHub repository](https://github.com/purepageio/fetch-engines).

## License

MIT

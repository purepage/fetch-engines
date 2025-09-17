# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Web scraping requires handling static HTML, JavaScript-heavy sites, network errors, retries, caching, and bot detection. Managing browser automation tools like Playwright adds complexity with resource pooling and stealth configurations.

`@purepageio/fetch-engines` provides engines for retrieving web content through a unified API.

**Key Benefits:**

- **Unified API:** Use `fetchHTML(url, options?)` for processed content or `fetchContent(url, options?)` for raw content
- **Smart Fallback Strategy:** Tries fast HTTP first, automatically falls back to full browser for complex sites
- **AI-Powered Data Extraction:** Extract structured data from web pages using OpenAI and Zod schemas
- **Raw Content Support:** Retrieve PDFs, images, APIs with the same fallback logic
- **Built-in Resilience:** Caching, retries, and standardised error handling
- **Browser Management:** Automatic browser pooling and stealth measures for complex sites
- **Content Transformation:** Convert HTML to clean Markdown
- **TypeScript Ready:** Fully typed codebase

## Table of Contents

- [Installation](#installation)
- [Engines](#engines)
- [Basic Usage](#basic-usage)
- [fetchHTML vs fetchContent](#fetchhtml-vs-fetchcontent)
- [Structured Content Extraction](#structured-content-extraction)
- [Configuration](#configuration)
- [Return Value](#return-value)
- [API Reference](#api-reference)
- [Stealth Features](#stealth-features)
- [Error Handling](#error-handling)
- [Contributing](#contributing)

## Installation

```bash
pnpm add @purepageio/fetch-engines
```

For `HybridEngine` (uses Playwright), install browser binaries:

```bash
pnpm exec playwright install
```

## Engines

**`HybridEngine`** (recommended): Attempts fast HTTP fetch first, falls back to Playwright browser on failure or when SPA shell detected. Handles both simple and complex sites automatically.

**`FetchEngine`**: Lightweight HTTP-only engine for basic sites without browser fallback.

**`StructuredContentEngine`**: AI-powered engine that combines HybridEngine with OpenAI for structured data extraction.

## Basic Usage

### Quick Start

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

// Simple sites use fast HTTP
const simple = await engine.fetchHTML("https://example.com");
console.log(`Title: ${simple.title}`);

// Complex sites automatically use browser
const complex = await engine.fetchHTML("https://spa-site.com", {
  markdown: true,
  spaMode: true,
});

await engine.cleanup(); // Important: releases browser resources
```

### With Custom Headers

```typescript
const engine = new HybridEngine({
  headers: { "X-Custom-Header": "value" },
});

const result = await engine.fetchHTML("https://example.com", {
  headers: { "X-Request-Header": "value" },
});
```

### Raw Content (PDFs, Images, APIs)

```typescript
const engine = new HybridEngine();

// Fetch PDF
const pdf = await engine.fetchContent("https://example.com/doc.pdf");
console.log(`PDF size: ${pdf.content.length} bytes`);

// Fetch JSON API with auth
const api = await engine.fetchContent("https://api.example.com/data", {
  headers: { Authorization: "Bearer token" },
});

await engine.cleanup();
```

## fetchHTML vs fetchContent

### `fetchHTML(url, options?)`

**Use for:** Web page content extraction

- Processes HTML and extracts metadata (title, etc.)
- Supports HTML-to-Markdown conversion
- Content-type restrictions (HTML/XML only)
- Returns processed content as `string`

### `fetchContent(url, options?)`

**Use for:** Raw content retrieval (like standard `fetch`)

- Retrieves any content type (PDFs, images, JSON, XML, etc.)
- No content-type restrictions
- Returns `Buffer` (binary) or `string` (text)
- Preserves original MIME type

### Example Comparison

```typescript
// fetchHTML - processes content
const html = await engine.fetchHTML("https://example.com");
console.log(html.title); // "Example Domain"
console.log(html.contentType); // "html" or "markdown"

// fetchContent - raw content
const raw = await engine.fetchContent("https://example.com");
console.log(raw.contentType); // "text/html"
console.log(typeof raw.content); // "string" (raw HTML)

// Binary content
const pdf = await engine.fetchContent("https://example.com/doc.pdf");
console.log(Buffer.isBuffer(pdf.content)); // true
```

## Structured Content Extraction

Extract structured data from web pages using AI and Zod schemas.

### Prerequisites

Set environment variable:

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

### Basic Usage

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";
import { z } from "zod";

const articleSchema = z.object({
  title: z.string(),
  author: z.string().optional(),
  publishDate: z.string().optional(),
  summary: z.string(),
  tags: z.array(z.string()),
});

const result = await fetchStructuredContent("https://example.com/article", articleSchema, {
  model: "gpt-4.1-mini",
  customPrompt: "Extract main article information",
});

console.log("Extracted:", result.data);
console.log("Token usage:", result.usage);
```

### StructuredContentEngine Class

```typescript
import { StructuredContentEngine } from "@purepageio/fetch-engines";

const productSchema = z.object({
  name: z.string(),
  price: z.number(),
  inStock: z.boolean(),
});

const engine = new StructuredContentEngine({
  spaMode: true,
  spaRenderDelayMs: 2000,
});

const result = await engine.fetchStructuredContent("https://shop.com/product", productSchema);
console.log(`${result.data.name} costs $${result.data.price}`);

await engine.cleanup();
```

### Supported Models

- `'gpt-5-mini'` - Latest model, mini version **(default)**
- `'gpt-5'` - Most capable model
- `'gpt-4.1-mini'` - Fast and cost-effective
- `'gpt-4.1'` - More capable GPT-4.1 version

## Configuration

### FetchEngine Options

| Option     | Type                     | Default | Description              |
| ---------- | ------------------------ | ------- | ------------------------ |
| `markdown` | `boolean`                | `false` | Convert HTML to Markdown |
| `headers`  | `Record<string, string>` | `{}`    | Custom HTTP headers      |

### HybridEngine Configuration

| Option             | Type                     | Default  | Description                                  |
| ------------------ | ------------------------ | -------- | -------------------------------------------- |
| `headers`          | `Record<string, string>` | `{}`     | Default headers for both engines             |
| `markdown`         | `boolean`                | `false`  | Default Markdown conversion                  |
| `useHttpFallback`  | `boolean`                | `true`   | Try HTTP before Playwright                   |
| `spaMode`          | `boolean`                | `false`  | Enable SPA mode with patient load conditions |
| `spaRenderDelayMs` | `number`                 | `0`      | Delay after page load in SPA mode            |
| `maxRetries`       | `number`                 | `3`      | Max retry attempts                           |
| `cacheTTL`         | `number`                 | `900000` | Cache TTL in ms (15 min default)             |
| `concurrentPages`  | `number`                 | `3`      | Max concurrent pages                         |

### Browser Pool Options

| Option               | Type     | Default   | Description                        |
| -------------------- | -------- | --------- | ---------------------------------- |
| `maxBrowsers`        | `number` | `2`       | Max browser instances              |
| `maxPagesPerContext` | `number` | `6`       | Pages per context before recycling |
| `maxBrowserAge`      | `number` | `1200000` | Browser lifetime (20 min)          |

### Header Precedence

Headers merge in this order (highest precedence first):

1. Request-specific headers in `fetchHTML(url, { headers })`
2. Engine constructor headers
3. Engine default headers

## Return Value

### HTMLFetchResult (fetchHTML)

- `content` (`string`): HTML or Markdown content
- `contentType` (`'html' | 'markdown'`): Content format
- `title` (`string | null`): Extracted page title
- `url` (`string`): Final URL after redirects
- `isFromCache` (`boolean`): Cache hit indicator
- `statusCode` (`number | undefined`): HTTP status code

### ContentFetchResult (fetchContent)

- `content` (`Buffer | string`): Raw content (binary as Buffer, text as string)
- `contentType` (`string`): Original MIME type
- `title` (`string | null`): Title if HTML content, otherwise null
- `url` (`string`): Final URL after redirects
- `isFromCache` (`boolean`): Cache hit indicator
- `statusCode` (`number | undefined`): HTTP status code

## API Reference

### `engine.fetchHTML(url, options?)`

- `url` (`string`): Target URL
- `options?` (`FetchOptions`):
  - `headers?: Record<string, string>`: Request headers
  - `markdown?: boolean`: Request Markdown (HybridEngine only)
  - `fastMode?: boolean`: Override fast mode (HybridEngine only)
  - `spaMode?: boolean`: Override SPA mode (HybridEngine only)
- **Returns:** `Promise<HTMLFetchResult>`

### `engine.fetchContent(url, options?)`

- `url` (`string`): Target URL
- `options?` (`ContentFetchOptions`):
  - `headers?: Record<string, string>`: Request headers
- **Returns:** `Promise<ContentFetchResult>`

### `fetchStructuredContent(url, schema, options?)`

- `url` (`string`): Target URL
- `schema` (`z.ZodSchema<T>`): Zod schema for extraction
- `options?` (`StructuredContentOptions`):
  - `model?: string`: OpenAI model (default: 'gpt-5-mini')
  - `customPrompt?: string`: Additional AI context
  - `engineConfig?: PlaywrightEngineConfig`: HybridEngine config
- **Returns:** `Promise<StructuredContentResult<T>>`

### `engine.cleanup()`

Shuts down browser instances for `HybridEngine` and `StructuredContentEngine`. Call when finished to release resources. No-op for `FetchEngine`.

## Stealth Features

When `HybridEngine` uses Playwright, it automatically applies stealth measures via `playwright-extra` and stealth plugins to bypass common bot detection. No manual configuration required.

Stealth techniques are not foolproof against sophisticated detection systems.

## Error Handling

Errors are thrown as `FetchError` instances with additional context:

- `message` (`string`): Error description
- `code` (`string | undefined`): Specific error code
- `originalError` (`Error | undefined`): Underlying error
- `statusCode` (`number | undefined`): HTTP status code

Common error codes:

- `ERR_HTTP_ERROR`: HTTP status >= 400
- `ERR_NON_HTML_CONTENT`: Non-HTML content for HTML request
- `ERR_FETCH_FAILED`: General fetch operation failure
- `ERR_PLAYWRIGHT_OPERATION`: Playwright operation failure
- `ERR_NAVIGATION`: Navigation timeout or failure
- `ERR_BROWSER_POOL_EXHAUSTED`: No available browser resources
- `ERR_MAX_RETRIES_REACHED`: All retry attempts exhausted
- `ERR_MARKDOWN_CONVERSION_NON_HTML`: Markdown conversion on non-HTML content

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

try {
  const result = await engine.fetchHTML(url);
} catch (error: any) {
  console.error(`Error: ${error.code || "Unknown"} - ${error.message}`);
  if (error.statusCode) console.error(`Status: ${error.statusCode}`);
}
```

## Contributing

Contributions welcome! Open an issue or submit a pull request on [GitHub](https://github.com/purepageio/fetch-engines).

## License

MIT

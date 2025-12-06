# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fetch websites with confidence. `@purepageio/fetch-engines` gives teams an HTTP-first workflow that automatically promotes tricky pages to a managed Playwright browser and can even hand structured results back through OpenAI.

## Table of contents

- [Why fetch-engines?](#why-fetch-engines)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Usage patterns](#usage-patterns)
  - [Pick an engine](#pick-an-engine)
  - [Structured extraction](#structured-extraction)
- [Configuration](#configuration)
  - [Essentials](#essentials)
  - [Complete reference](#complete-reference)
- [Error handling](#error-handling)
- [Tooling and examples](#tooling-and-examples)
- [Contributing](#contributing)
- [License](#license)

## Why fetch-engines?

- **One API for multiple strategies** – Call `fetchHTML` for rendered pages or `fetchContent` for raw responses. The library handles HTTP shortcuts and Playwright fallbacks automatically.
- **Production-minded defaults** – Retries, caching, and consistent telemetry are ready out of the box.
- **Drop-in AI enrichment** – Provide a Zod schema and let OpenAI (or any OpenAI-compatible API) convert full pages into structured data.
- **Typed and tested** – Built in TypeScript with examples that mirror real-world scraping pipelines.

## Installation

```bash
pnpm add @purepageio/fetch-engines
# install Playwright browsers once if you plan to use the Hybrid or Playwright engines
pnpm exec playwright install
```

## Quick start

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine();

const page = await engine.fetchHTML("https://example.com");
console.log(page.title);

await engine.cleanup();
```

## Usage patterns

### Pick an engine

| Engine                    | When to use it                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| `HybridEngine`            | Default option. Starts with HTTP, then retries via Playwright for tougher pages. |
| `FetchEngine`             | Lightweight HTML/text fetching with zero browser overhead.                       |
| `StructuredContentEngine` | Fetch a page and transform it into typed data with OpenAI.                       |

### Structured extraction

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";
import { z } from "zod";

type Article = {
  title: string;
  summary: string;
};

const schema = z.object({
  title: z.string(),
  summary: z.string(),
});

const result = await fetchStructuredContent("https://example.com/article", schema, { model: "gpt-4.1-mini" });

console.log(result.data.summary);
```

Set `OPENAI_API_KEY` before running structured helpers, or use `apiConfig` to connect to OpenAI-compatible APIs like OpenRouter:

```typescript
const result = await fetchStructuredContent("https://example.com/article", schema, {
  model: "anthropic/claude-3.5-sonnet",
  apiConfig: {
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://your-app.com",
      "X-Title": "Your App Name",
    },
  },
});
```

## Configuration

### Essentials

All engines accept familiar `fetch` options such as custom headers. Additional Hybrid/Playwright options you are likely to tweak:

- `markdown` – return Markdown instead of HTML.
- `spaMode` & `spaRenderDelayMs` – allow single-page apps to render before extraction.
- `cacheTTL`, `maxRetries`, and browser pool sizes – control resilience and throughput.

Check the inline TypeScript docs or the [`/examples`](./examples) directory for end-to-end flows.

### Complete reference

Every option from `PlaywrightEngineConfig` (consumed by `HybridEngine`) with defaults:

| Option                     | Default     | Purpose                                                                                       |
| -------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `headers`                  | `{}`        | Extra headers merged into every request.                                                      |
| `concurrentPages`          | `3`         | Maximum Playwright pages processed at once.                                                   |
| `maxRetries`               | `3`         | Additional retry attempts after the first failure.                                            |
| `retryDelay`               | `5000`      | Milliseconds to wait between retries.                                                         |
| `cacheTTL`                 | `900000`    | Cache lifetime in ms (`0` disables caching).                                                  |
| `useHttpFallback`          | `true`      | Try a fast HTTP GET before spinning up Playwright.                                            |
| `useHeadedModeFallback`    | `false`     | Automatically retry a domain in headed mode after repeated failures.                          |
| `defaultFastMode`          | `true`      | Block non-critical assets and skip human simulation unless overridden.                        |
| `simulateHumanBehavior`    | `true`      | When not in fast mode, add delays and scrolling to avoid bot detection.                       |
| `maxBrowsers`              | `2`         | Highest number of Playwright browser instances kept in the pool.                              |
| `maxPagesPerContext`       | `6`         | Pages opened per browser context before recycling it.                                         |
| `maxBrowserAge`            | `1200000`   | Milliseconds before a browser instance is torn down (20 minutes).                             |
| `healthCheckInterval`      | `60000`     | Pool health check frequency in ms.                                                            |
| `poolBlockedDomains`       | `[]`        | Domains blocked across every Playwright request (inherit pool defaults if empty).             |
| `poolBlockedResourceTypes` | `[]`        | Resource types (e.g. `"image"`) blocked globally.                                             |
| `proxy`                    | `undefined` | Per-browser proxy `{ server, username?, password? }`.                                         |
| `useHeadedMode`            | `false`     | Force every browser to launch with a visible window.                                          |
| `markdown`                 | `true`      | Return Markdown (instead of HTML) when possible. Override per request with `markdown: false`. |
| `spaMode`                  | `false`     | Enable SPA heuristics and allow additional waits for client rendering.                        |
| `spaRenderDelayMs`         | `0`         | Extra delay after load when `spaMode` is `true`.                                              |
| `playwrightOnlyPatterns`   | `[]`        | URLs matching any string/regex go straight to Playwright, skipping HTTP fetches.              |
| `playwrightLaunchOptions`  | `undefined` | Options passed to `browserType.launch` (see Playwright docs).                                 |

Per-request overrides: `fetchHTML` accepts `fastMode`, `markdown`, `spaMode`, and `headers`, while `fetchContent` supports `fastMode` and `headers`.

## Error handling

Failures raise a typed `FetchError` exposing `code`, `statusCode`, and the underlying error. Log these fields to diagnose issues quickly and tune your retry policy.

## Tooling and examples

- Explore the [`examples`](./examples) directory for scripts you can run end-to-end.
- Ready-to-use TypeScript types ship with the package.
- `pnpm test` runs the automated suite when you are ready to contribute.

## Contributing

Issues and pull requests are welcome! Please follow the existing linting/test commands before sending a change.

## License

Distributed under the [MIT](./LICENSE) license.

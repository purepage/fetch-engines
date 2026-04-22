# @purepageio/fetch-engines

[![npm version](https://img.shields.io/npm/v/@purepageio/fetch-engines.svg)](https://www.npmjs.com/package/@purepageio/fetch-engines)
[![CI](https://github.com/purepage/fetch-engines/actions/workflows/publish.yml/badge.svg)](https://github.com/purepage/fetch-engines/actions/workflows/publish.yml)
[![Live Browser Evals](https://github.com/purepage/fetch-engines/actions/workflows/live-browser-evals.yml/badge.svg)](https://github.com/purepage/fetch-engines/actions/workflows/live-browser-evals.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Reliable web extraction.

HTTP-first for speed. Browser-backed when needed. Clean Markdown, soft-block handling, and structured extraction for RAG and AI pipelines.

## Table of contents

- [Why fetch-engines?](#why-fetch-engines)
- [Why trust fetch-engines](#why-trust-fetch-engines)
- [Library vs hosted crawler](#library-vs-hosted-crawler)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Usage patterns](#usage-patterns)
  - [Pick an engine](#pick-an-engine)
  - [Markdown mode](#markdown-mode)
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
- **Automatic app-shell & soft-block detection** – Shell-like HTTP responses and bot-gate pages (Cloudflare challenges, CAPTCHAs, "verify you're human") are upgraded to Playwright rendering by default, so client-rendered pages and soft blocks work without per-domain rules.
- **RAG-ready Markdown** – Convert public content pages to clean Markdown with boilerplate, nav, and SVG noise stripped out. Powered by a Rust-native converter.
- **HTTP-first, browser-backed when needed** – Fast pages stay cheap via plain HTTP, while harder pages automatically benefit from Playwright fallback.
- **Structured extraction built in** – Define a Zod schema and go from URL to typed data via any OpenAI-compatible API. The page is fetched as Markdown first to minimise tokens.
- **Playwright is optional** – `FetchEngine` works without browser dependencies. Playwright is only loaded when you use `HybridEngine` or `PlaywrightEngine`.

## Why trust fetch-engines

- **19 live URLs across 7 archetypes** (docs, government, knowledge, marketing, commerce, static, access-guarded) validated on every release and nightly via browser-enabled CI
- **85 unit tests + dedicated live browser eval workflow** — not just "it compiles," but "it extracts real content from real pages"
- Handles app shells, Cloudflare challenges, CAPTCHAs, and utility-class-heavy doc sites (Tailwind, Vite) without per-domain rules
- Produces clean Markdown with absolute URLs — boilerplate removal typically reduces raw HTML to 10–30% of its original size before it reaches your LLM
- Structured extraction with Zod schemas and any OpenAI-compatible provider, in the same pipeline as page fetching

## Library vs hosted crawler

|                     | fetch-engines                           | Hosted crawlers     |
| ------------------- | --------------------------------------- | ------------------- |
| **Runs where**      | Your Node.js process                    | Third-party API     |
| **Data stays**      | In your infrastructure                  | Leaves your network |
| **Cost model**      | Free + your compute                     | Per-page pricing    |
| **Customisation**   | Full source access, tune heuristics     | Configuration flags |
| **Browser control** | Your Playwright instance, your proxy    | Opaque              |
| **Transparency**    | Open tests, open evals, open heuristics | Black box           |

Choose `fetch-engines` when you want full control over extraction, data residency, and cost. Choose a hosted crawler when you need managed infrastructure and don't want to run browsers yourself.

## Installation

```bash
pnpm add @purepageio/fetch-engines
```

If you plan to use `HybridEngine` or `PlaywrightEngine` (which launch a real browser), install the Playwright browsers once:

```bash
pnpm exec playwright install
```

This step is **not needed** if you only use `FetchEngine` or `StructuredContentEngine`.

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

| Engine                    | When to use it                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `HybridEngine`            | Default option. Starts with HTTP, then retries via Playwright for tougher pages.      |
| `FetchEngine`             | Lightweight HTML/text fetching with zero browser overhead. Supports `markdown: true`. |
| `StructuredContentEngine` | Fetch a page and transform it into typed data with OpenAI.                            |

### Markdown mode

Pass `markdown: true` to get clean Markdown instead of raw HTML — ideal for RAG pipelines, LLM context windows, and content indexing. The converter strips navigation, footers, sidebars, SVGs, and high-link-density boilerplate before converting via a Rust-native engine.

```typescript
import { HybridEngine } from "@purepageio/fetch-engines";

const engine = new HybridEngine({ markdown: true });
const page = await engine.fetchHTML("https://example.com/blog/my-post");

console.log(page.content); // Clean Markdown with headings, tables, code blocks preserved
console.log(page.contentType); // "markdown"

await engine.cleanup();
```

`FetchEngine` also supports `markdown: true` for static pages that don't need JavaScript rendering. `HybridEngine` now decides whether to render before converting to Markdown, so shell detection still works when callers request Markdown output.
Relative links and image URLs in Markdown output are normalized to absolute URLs using the final fetched page URL. The converter strips generic UI chrome (nav/footer/button controls and dense link clusters) using domain-agnostic heuristics, while preserving content on pages without semantic `<main>`/`<article>` containers (e.g., Tailwind CSS docs).
The extraction path is tuned for publicly accessible content. Paywalled or member-only pages may still return intentionally partial content unless you supply authenticated access yourself.

### Structured extraction

```typescript
import { fetchStructuredContent } from "@purepageio/fetch-engines";
import { z } from "zod";

// IMPORTANT: All schema fields must have .describe() calls to guide the AI model
const schema = z.object({
  title: z.string().describe("The title of the article"),
  summary: z.string().describe("A brief summary of the article content"),
});

// model is required - use any model supported by your API provider
const result = await fetchStructuredContent("https://example.com/article", schema, { model: "gpt-4.1-mini" });

console.log(result.data.summary);
```

Under the hood, structured extraction fetches the page as Markdown first (same boilerplate removal as Markdown mode), then sends the cleaned content to the AI model — keeping token usage low and extraction quality high.

Set `OPENAI_API_KEY` (or `OPENROUTER_API_KEY`) before running structured helpers, or use `apiConfig` to connect to OpenAI-compatible APIs like OpenRouter. The engine automatically adds the `Authorization` header when you provide an API key:

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

When you supply a custom `baseURL`, the engine automatically switches to the Vercel AI SDK's `createOpenAICompatible` provider (instead of `createOpenAI`) so OpenAI-compatible services like OpenRouter receive the correct API-key auth flow.

## Configuration

### Essentials

All engines accept familiar `fetch` options such as custom headers. Additional Hybrid/Playwright options you are likely to tweak:

- `markdown` – return Markdown instead of HTML.
- Automatic shell detection is enabled by default. `spaMode` & `spaRenderDelayMs` still force a more patient render path when you know a page is highly dynamic.
- `cacheTTL`, `maxRetries`, and browser pool sizes – control resilience and throughput.

Check the inline TypeScript docs or the [`/examples`](./examples) directory for end-to-end flows.

### Complete reference

Every option from `PlaywrightEngineConfig` (consumed by `HybridEngine`) with defaults:

| Option                     | Default     | Purpose                                                                                            |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `headers`                  | `{}`        | Extra headers merged into every request.                                                           |
| `concurrentPages`          | `3`         | Maximum Playwright pages processed at once.                                                        |
| `maxRetries`               | `3`         | Additional retry attempts after the first failure.                                                 |
| `retryDelay`               | `5000`      | Milliseconds to wait between retries.                                                              |
| `cacheTTL`                 | `900000`    | Cache lifetime in ms (`0` disables caching).                                                       |
| `useHttpFallback`          | `true`      | Try a fast HTTP GET before spinning up Playwright.                                                 |
| `useHeadedModeFallback`    | `false`     | Automatically retry a domain in headed mode after repeated failures.                               |
| `defaultFastMode`          | `true`      | Block non-critical assets and skip human simulation unless overridden.                             |
| `simulateHumanBehavior`    | `true`      | When not in fast mode, add delays and scrolling to avoid bot detection.                            |
| `maxBrowsers`              | `2`         | Highest number of Playwright browser instances kept in the pool.                                   |
| `maxPagesPerContext`       | `6`         | Pages opened per browser context before recycling it.                                              |
| `maxBrowserAge`            | `1200000`   | Milliseconds before a browser instance is torn down (20 minutes).                                  |
| `healthCheckInterval`      | `60000`     | Pool health check frequency in ms.                                                                 |
| `poolBlockedDomains`       | `[]`        | Domains blocked across every Playwright request (inherit pool defaults if empty).                  |
| `poolBlockedResourceTypes` | `[]`        | Resource types (e.g. `"image"`) blocked globally.                                                  |
| `proxy`                    | `undefined` | Per-browser proxy `{ server, username?, password? }`.                                              |
| `useHeadedMode`            | `false`     | Force every browser to launch with a visible window.                                               |
| `markdown`                 | `false`     | Return Markdown instead of raw HTML. Converts via a Rust-native engine with boilerplate removal.   |
| `spaMode`                  | `false`     | Force the more patient render path. Many shell-like pages are auto-detected even when this is off. |
| `spaRenderDelayMs`         | `0`         | Minimum extra wait budget when `spaMode` is `true`.                                                |
| `playwrightOnlyPatterns`   | `[]`        | URLs matching any string/regex go straight to Playwright, skipping HTTP shell detection.           |
| `playwrightLaunchOptions`  | `undefined` | Options passed to `browserType.launch` (see Playwright docs).                                      |

Per-request overrides: `fetchHTML` accepts `fastMode`, `markdown`, `spaMode`, and `headers`, while `fetchContent` supports `fastMode` and `headers`.

## Error handling

Failures raise a typed `FetchError` exposing `code`, `statusCode`, and the underlying error. Log these fields to diagnose issues quickly and tune your retry policy.

## Tooling and examples

- Explore the [`examples`](./examples) directory for scripts you can run end-to-end.
- Ready-to-use TypeScript types ship with the package.
- `pnpm test` runs the automated suite when you are ready to contribute.
- `pnpm test:live:smoke` runs the browser-backed live smoke suite, including a markdown fetch check for `https://www.bhp.com/`.
- `pnpm eval:auto-render` runs a live Hybrid-vs-HTTP quality matrix across docs, government, knowledge, marketing, commerce, and access-guarded pages, using a stable gated core plus observe-only sentinels for harder domains.
- `pnpm test:live:auto-render` runs the same hypothesis as a Vitest live test (`LIVE_NETWORK=1`) in a Node environment so it exercises the real network/browser stack instead of `jsdom`.
- GitHub Actions includes a dedicated browser-enabled live eval workflow that runs on `main` changes, nightly on a schedule, and on manual dispatch. It uploads the JSON report as a build artifact.

## Contributing

Issues and pull requests are welcome! Before submitting a change:

1. `pnpm test` — all tests pass
2. `pnpm lint` — no errors
3. `pnpm format` — code is formatted
4. Update `CHANGELOG.md` under `[Unreleased]`
5. Bump the version in `package.json` following [semver](https://semver.org/)

See [`AGENTS.md`](./AGENTS.md) for detailed guidelines on versioning, testing, and documentation.

## License

Distributed under the [MIT](./LICENSE) license.

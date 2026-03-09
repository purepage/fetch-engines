# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.1] - 2026-03-09

### Added

- Added a dedicated live browser evaluation badge to the README so validation coverage is visible from the project landing page
- Added a new "Why teams trust fetch-engines" section to the README highlighting live eval coverage, browser CI, and extraction strengths
- Added a dedicated GitHub Actions workflow for browser-enabled live auto-render coverage, with runs on `main`, nightly schedule, and manual dispatch
- Live browser CI now uploads the `pnpm eval:auto-render` JSON report as an artifact for inspection
- Expanded the live auto-render evaluation matrix to cover 19 real URLs across documentation, government, knowledge, marketing, commerce, static-baseline, and access-guarded archetypes
- Added observe-only live cases for chrome-heavy product pages and HTTP-blocked pages that should succeed via browser fallback
- Added a regression test ensuring metered/paywalled partial-content prompts are not misclassified as soft-block bot challenges
- Soft-block page detection (`isSoftBlockPage`) — Cloudflare challenges, CAPTCHAs, "verify you're human" interstitials, and similar bot-gate pages are now detected and escalated to Playwright rendering automatically
- Regression tests for documentation sites (MDN, Docusaurus, Read the Docs, Vite, Tailwind CSS) ensuring content extraction works on pages without `<main>` or `<article>` elements
- Added "Library vs hosted crawler" comparison table to README for clearer competitive positioning
- Added concrete metrics to the trust section (19 live URLs, 7 archetypes, 85 unit tests, boilerplate-reduction stat)

### Fixed

- Resolved `@kreuzberg/html-to-markdown` ESM interop under `tsx watch` by replacing the fragile named import with a namespace-based `convert` resolver in `MarkdownConverter`
- Link density removal no longer strips large layout containers that hold both navigation and content — pages like Tailwind CSS docs (no semantic `<main>` tag) now extract correctly instead of producing empty output
- `HybridEngine._shouldAutoRender` now checks for soft-block pages before assessing render need, preventing challenge pages with valid-looking HTML from being returned as actual content

### Changed

- Updated the package description to position `fetch-engines` as a production-grade public-web extraction library for Node.js
- Reworked the README hero copy to emphasize reliability, browser-backed extraction, clean Markdown, and RAG/AI use cases more clearly
- Refined the top-level value proposition bullets to better differentiate HTTP-first extraction, Playwright fallback, and built-in structured extraction
- The main publish workflow no longer installs Playwright or carries dormant opt-in live-test logic; browser-dependent coverage now lives in its own explicit CI lane
- README tooling docs now describe the dedicated live browser evaluation workflow
- `pnpm eval:auto-render` and `test/live/AutoRenderHypothesis.test.ts` now share a single case matrix, include archetype labels in reports, and support cases where direct HTTP baseline fetches are expected to fail
- README positioning now reflects validated coverage more precisely: public content pages, not a blanket "any page" claim
- Renamed "Why teams trust fetch-engines" to "Why trust fetch-engines" for broader appeal
- Tightened "HTTP-first, browser-backed when needed" value prop bullet

## [0.10.0] - 2026-03-07

### Added

- Added automatic app-shell detection in `HybridEngine`, so shell-like HTTP pages now escalate to Playwright by default without requiring per-domain configuration
- Added a live `pnpm eval:auto-render` harness and `LIVE_NETWORK=1` hypothesis tests for comparing plain HTTP responses against automatic rendering on real URLs
- Added a gated live quality matrix (SPA + static) with per-URL keyword/text/quality checks, plus pass-rate thresholds to catch regressions while keeping known-hard domains visible as non-gating sentinels

### Changed

- `HybridEngine` now fetches raw HTML first, decides whether rendering is necessary, and only converts to Markdown after that decision so SPA shell detection works even when callers request Markdown
- `PlaywrightEngine` now returns serialized DOM HTML for HTML documents instead of the original navigation response body, which fixes client-rendered pages whose initial response is only an app shell
- Playwright rendering now waits for generic content growth and a short quiet window, reducing reliance on fixed sleeps and `networkidle` alone

### Fixed

- `HybridEngine` auto-render path now skips Playwright's HTTP fallback and uses `spaMode` when a shell is detected, so slow SPAs (e.g. Fanatico) are actually rendered instead of returning the empty HTTP response again
- Markdown conversion now resolves relative links and image sources to absolute URLs using the fetched page URL context, so output no longer contains unresolved `/path` links by default
- Markdown conversion now removes generic utility controls (buttons and button-like UI elements) and prunes dense link-heavy chrome clusters from selected content, reducing boilerplate bleed-through without domain-specific rules
- Markdown post-processing now separates adjacent link runs to avoid unreadable `][` link blobs in extracted output

## [0.9.1] - 2026-03-05

### Changed

- Updated README tagline, "Why" section, and package description for clarity
- Added Markdown mode section, contributing checklist, and security policy to README
- Improved CI workflow: version-gated npm publish and automatic GitHub releases
- Added GitHub issue and PR templates
- Fixed overly broad CSS class matching in boilerplate detection

## [0.9.0] - 2026-03-05

### Changed

- Replaced Turndown with `@kreuzberg/html-to-markdown` (Rust-native) for HTML-to-Markdown conversion. Same public API; ~6x faster conversion, fewer dependencies.
- Strip SVG elements and SVG images (inline base64 + external .svg URLs) before conversion to reduce RAG pipeline bloat.
- Fix `no-explicit-any` lint warnings in `StructuredContentEngine`.

### Removed

- `turndown`, `turndown-plugin-gfm`, and `@types/turndown` dependencies

## [0.8.1] - 2025-12-09

### Fixed

- Fixed "No cookie auth credentials found" error when using `apiConfig` with OpenAI-compatible APIs (OpenRouter, etc.) - the library now correctly lets `createOpenAICompatible` handle authentication via the `apiKey` parameter instead of manually adding Authorization headers

## [0.8.0] - 2025-12-09

### Added

- Schema field descriptions are now required - all Zod schema fields must include `.describe()` calls to guide the AI model
- Improved error messages for structured content extraction failures, including better detection of key mismatches and type validation errors
- Automatic suppression of AI SDK warnings about responseFormat/structuredOutputs when using OpenAI-compatible APIs

### Changed

- **BREAKING**: `fetchStructuredContent` now requires all schema fields to have descriptions via `.describe()` method. Update your schemas to add `.describe()` calls to each field.
- Enhanced system prompt to include field descriptions, improving extraction accuracy and data type handling

### Fixed

- Route OpenAI-compatible `apiConfig.baseURL` values through `createOpenAICompatible` to avoid cookie-based auth errors
- Fixed price extraction - models now correctly return numeric values instead of currency strings when descriptions specify the expected format

## [0.7.3] - 2025-12-09

### Fixed

- Ensure `apiConfig` uses provided API keys for OpenAI-compatible providers by always sending an `Authorization` header and supporting the `OPENROUTER_API_KEY` environment variable as a fallback

## [0.7.2] - 2025-02-13

### Fixed

- Ensure `apiConfig` uses provided API keys for OpenAI-compatible providers by always sending an `Authorization` header and supporting the `OPENROUTER_API_KEY` environment variable as a fallback

## [0.7.0] - 2024-12-XX

### Added

- Support for OpenAI-compatible APIs (OpenRouter, etc.) via new `apiConfig` option in `StructuredContentOptions`
- `ApiConfig` interface with `apiKey`, `baseURL`, and `headers` options for custom API providers
- Flexible model names - `model` parameter now accepts any string (not just predefined OpenAI models)

### Changed

- **BREAKING**: `model` is now required in `StructuredContentOptions` (no default model)
- Error message for missing API key now mentions both `apiConfig.apiKey` and `OPENAI_API_KEY` environment variable

## [0.6.2] - YYYY-MM-DD

### Fixed

- (Previous releases - add as needed)

[Unreleased]: https://github.com/purepage/fetch-engines/compare/v0.10.1...HEAD
[0.10.1]: https://github.com/purepage/fetch-engines/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/purepage/fetch-engines/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/purepage/fetch-engines/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/purepage/fetch-engines/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/purepage/fetch-engines/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/purepage/fetch-engines/compare/v0.7.3...v0.8.0
[0.7.3]: https://github.com/purepage/fetch-engines/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/purepage/fetch-engines/compare/v0.7.0...v0.7.2
[0.7.0]: https://github.com/purepage/fetch-engines/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/purepage/fetch-engines/compare/v0.6.1...v0.6.2

# Requirements for @purepageio/fetch-engines

This document outlines the functional and non-functional requirements for the `@purepageio/fetch-engines` package.

## 1. Core Functionality

- **FR1.1:** The package MUST provide programmatic interfaces (Engines) to fetch the HTML content of a web page given its URL.
- **FR1.2:** Engines MUST return a structured result object (`FetchResult`) upon completion (successful or otherwise).
- **FR1.3:** The `FetchResult` object MUST contain:
    - `html`: The retrieved HTML content as a string.
    - `title`: The extracted content of the `<title>` tag, or `null`.
    - `url`: The final URL after any redirects.
    - `isFromCache`: A boolean indicating if the result was served from cache.
    - `statusCode`: The HTTP status code of the final response (if available).
    - `error`: An error object if the fetch operation ultimately failed after all attempts.

## 2. FetchEngine

- **FR2.1:** The package MUST provide a `FetchEngine` that uses the standard `fetch` API for retrieving HTML.
- **FR2.2:** The `FetchEngine` SHOULD be lightweight and optimized for speed on pages not requiring JavaScript execution.
- **FR2.3:** The `FetchEngine` MUST handle standard HTTP redirects.

## 3. PlaywrightEngine

- **FR3.1:** The package MUST provide a `PlaywrightEngine` that uses Playwright to control a headless browser for retrieving HTML.
- **FR3.2:** The `PlaywrightEngine` MUST be capable of rendering JavaScript on the target page before extracting HTML.
- **FR3.3:** The `PlaywrightEngine` MUST implement a configurable retry mechanism for failed fetch attempts.
    - **FR3.3.1:** The number of retries MUST be configurable.
    - **FR3.3.2:** The delay between retries MUST be configurable.
- **FR3.4:** The `PlaywrightEngine` MUST implement a configurable in-memory caching mechanism for fetch results.
    - **FR3.4.1:** The cache Time-To-Live (TTL) MUST be configurable.
    - **FR3.4.2:** Caching MUST be disableable.
- **FR3.5:** The `PlaywrightEngine` MUST integrate `playwright-extra` and the `puppeteer-extra-plugin-stealth` plugin automatically to help bypass bot detection.
- **FR3.6:** The `PlaywrightEngine` MUST manage an internal pool of Playwright browser instances.
    - **FR3.6.1:** The maximum number of concurrent browser instances MUST be configurable.
    - **FR3.6.2:** Browser instance recycling parameters (max pages per context, max browser age) MUST be configurable.
    - **FR3.6.3:** Resource blocking (domains, resource types) within the browser pool MUST be configurable.
    - **FR3.6.4:** Proxy usage for browser instances MUST be configurable.
- **FR3.7:** The `PlaywrightEngine` MUST provide an optional "HTTP fallback" mode, attempting a simple GET request before launching a full browser session.
- **FR3.8:** The `PlaywrightEngine` MUST provide an optional "headed mode fallback", automatically using a visible browser for subsequent attempts to a domain if an initial headless attempt fails.
- **FR3.9:** The `PlaywrightEngine` MUST provide a `cleanup()` method to gracefully shut down all managed browser instances and release resources. This method MUST be explicitly called by the user when finished.
- **FR3.10:** The `PlaywrightEngine` MUST allow overriding certain configurations (like `fastMode`) on a per-request basis via the `fetchHTML` method options.

## 4. HybridEngine

- **FR4.1:** The package MUST provide a `HybridEngine`.
- **FR4.2:** The `HybridEngine` MUST first attempt to fetch HTML using a mechanism similar to `FetchEngine`.
- **FR4.3:** If the initial fetch attempt fails for any reason (network error, non-2xx status code, non-HTML content, etc.), the `HybridEngine` MUST automatically fall back to using an internal `PlaywrightEngine` instance for a subsequent attempt.
- **FR4.4:** The configuration of the internal `PlaywrightEngine` used by `HybridEngine` MUST be customizable via the `HybridEngine` constructor.
- **FR4.5:** The `HybridEngine` MUST provide a `cleanup()` method that cleans up the resources of its internal `PlaywrightEngine`.

## 5. Error Handling

- **FR5.1:** Engines MUST handle common fetch-related errors (e.g., network errors, timeouts, HTTP errors).
- **FR5.2:** The package SHOULD provide custom error types (e.g., `FetchError`) extending the base `Error` class to provide more context about fetch failures.
- **FR5.3:** Failed fetch attempts, after exhausting retries, MUST result in the `error` property being set in the returned `FetchResult` object.

## 6. Non-Functional Requirements

- **NFR6.1:** The package MUST be installable using npm, pnpm, and yarn.
- **NFR6.2:** The package MUST be written in TypeScript and provide type definitions.
- **NFR6.3:** The package MUST include documentation (e.g., a `README.md`) explaining installation, usage, configuration, and API.
- **NFR6.4:** If `PlaywrightEngine` or `HybridEngine` are used, the user MUST be instructed to install Playwright browser binaries separately.
- **NFR6.5:** The package MUST be licensed under a permissive open-source license (e.g., MIT). 

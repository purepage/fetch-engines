# Fetch Engines - Areas for Improvement

This document outlines areas identified for improvement in the `@purepageio/fetch-engines` package based on a code review conducted before the initial v0.1.0 release.

## High Priority (Recommended Before v0.1.0)

1.  **[x] Remove Process Signal Listeners (`PlaywrightEngine`)**

    - **Issue:** Using `process.on("SIGTERM"/"SIGINT")` inside the constructor is unsuitable for a library, potentially conflicting with user applications.
    - **Recommendation:** Remove these listeners. Rely solely on the user calling the `engine.cleanup()` method explicitly during their application shutdown.

2.  **[x] Refactor Logging (`PlaywrightEngine` & `PlaywrightBrowserPool`)**

    - **Issue:** Direct use of `console.log`/`console.error` pollutes consumer logs and isn't configurable.
    - **Recommendation:** Replace direct console calls. Options:
      - [x] Use a dedicated, configurable logging library (e.g., `debug`).
      - [ ] Allow users to inject their own logger instance.
      - [ ] Significantly reduce logging, only outputting critical errors.

3.  **[~] Implement `PlaywrightBrowserPool` Tests (Setup Done)**

    - **Issue:** This critical, complex component lacks dedicated unit tests.
    - **Recommendation:** Create comprehensive tests for `PlaywrightBrowserPool.ts` covering:
      - [x] Instance creation and initialization (Basic tests added).
      - [ ] Page acquisition and release logic.
      - [ ] Health check logic (age, idle, connectivity).
      - [ ] Instance cleanup and replacement.
      - [ ] Edge cases and error handling.

4.  **[x] Make Pool Request Blocking Configurable (`PlaywrightBrowserPool`)**
    - **Issue:** `blockedDomains` and `blockedResourceTypes` are hardcoded.
    - **Recommendation:** Allow users to provide their own lists of domains and resource types to block via the pool constructor options.

## Medium Priority (Consider for v0.1.0 or v0.2.0)

1.  **Improve Pool Health Checks (`PlaywrightBrowserPool`)**

    - **Issue:** Current check (`browser.isConnected()`) is basic.
    - **Recommendation:** Implement a more robust check, potentially involving creating a temporary page or executing a simple script to confirm responsiveness.

2.  **Refine Error Handling (`PlaywrightEngine`)**

    - **Issue:** Final errors might obscure the root cause after multiple retries/fallbacks.
    - **Recommendation:** Consider structuring errors better, perhaps including details about the sequence of attempts (e.g., fallback failure -> FAST mode failure -> THOROUGH mode failure).

3.  **Clean Up `types.ts`**
    - **Issue:** Contains an empty, unused `BrowserPoolConfig` interface.
    - **Recommendation:** Remove the unused interface.

## Lower Priority / Long Term

1.  **Reduce Complexity (`PlaywrightEngine`)**

    - **Issue:** The main engine class is very large and the fetch/retry logic is deeply nested and complex.
    - **Recommendation:** Explore ways to break down the `fetchHTML` and related private methods into smaller, more focused functions or potentially separate helper classes. This would improve readability, testability, and maintainability. (Likely a post-v0.1.0 task).

2.  **Enhance Documentation**
    - **Issue:** Current `README.md` is basic.
    - **Recommendation:** Add more comprehensive documentation covering all configuration options, advanced usage patterns, API details, and potentially architectural explanations.

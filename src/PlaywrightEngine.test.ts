import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import { PlaywrightBrowserPool } from "./browser/PlaywrightBrowserPool.js";
import type {
  // REMOVED Browser,
  Page,
  // REMOVED Route,
  Response as PlaywrightResponse,
} from "playwright";

import axios from "axios";
import { EventEmitter } from "events";

// Mock axios
vi.mock("axios");

// Mock the BrowserPool itself
vi.mock("./browser/PlaywrightBrowserPool.js", () => {
  // console.log("Mocking PlaywrightBrowserPool...");
  const MockBrowserPool = vi.fn();
  MockBrowserPool.prototype.initialize = vi.fn().mockResolvedValue(undefined);
  MockBrowserPool.prototype.acquirePage = vi.fn(); // Mocked per test
  MockBrowserPool.prototype.releasePage = vi.fn().mockResolvedValue(undefined);
  MockBrowserPool.prototype.cleanup = vi.fn().mockResolvedValue(undefined);
  MockBrowserPool.prototype.getMetrics = vi.fn().mockReturnValue([]); // Default to empty metrics
  return { PlaywrightBrowserPool: MockBrowserPool };
});

// Helper function to create a mock Playwright Response
const createMockResponse = (): PlaywrightResponse => {
  return {
    ok: vi.fn().mockReturnValue(true),
    status: vi.fn().mockReturnValue(200),
    headers: vi.fn().mockReturnValue({ "content-type": "text/html" }),
    // Add other methods/properties if needed by the engine
    // body: vi.fn().mockResolvedValue(Buffer.from("")),
    // text: vi.fn().mockResolvedValue(""),
    // json: vi.fn().mockResolvedValue({}),
    // etc.
  } as unknown as PlaywrightResponse;
};

// Helper to create mock Page
const createMockPage = (): Page => {
  const pageEmitter = new EventEmitter();
  const mockPage = {
    goto: vi.fn().mockResolvedValue(createMockResponse()), // Mock goto to return mock response
    content: vi.fn().mockResolvedValue("<html>Mock HTML</html>"),
    title: vi.fn().mockResolvedValue("Mock Title"),
    url: vi.fn().mockReturnValue("http://mock.example.com"),
    close: vi.fn().mockImplementation(() => {
      pageEmitter.emit("close");
      return Promise.resolve();
    }),
    isClosed: vi.fn().mockReturnValue(false),
    on: pageEmitter.on.bind(pageEmitter),
    once: pageEmitter.once.bind(pageEmitter),
    off: pageEmitter.off.bind(pageEmitter),
    evaluate: vi.fn(), // Mock evaluate if needed
    mouse: { move: vi.fn().mockResolvedValue(undefined) }, // Mock mouse if behavior simulation tested
    // Add other methods/properties as needed by the engine
  } as unknown as Page;
  return mockPage;
};

describe(
  "PlaywrightEngine",
  () => {
    let engine: PlaywrightEngine;
    let mockAcquirePage: ReturnType<typeof vi.fn>;
    let mockCleanupPool: ReturnType<typeof vi.fn>;
    let mockGetMetrics: ReturnType<typeof vi.fn>;
    let mockAxiosGet: ReturnType<typeof vi.fn>;
    let browserPoolMock: PlaywrightBrowserPool;
    // Store spies to restore them
    let spies: any[] = [];

    beforeEach(() => {
      vi.clearAllMocks();
      vi.useRealTimers(); // Ensure real timers by default

      mockAcquirePage = vi.fn();
      mockCleanupPool = vi.fn();
      mockGetMetrics = vi.fn().mockReturnValue([]);

      // Use vi.spyOn for prototype methods
      spies = [
        vi.spyOn(PlaywrightBrowserPool.prototype, "initialize").mockResolvedValue(undefined),
        vi.spyOn(PlaywrightBrowserPool.prototype, "acquirePage").mockImplementation(mockAcquirePage),
        vi.spyOn(PlaywrightBrowserPool.prototype, "cleanup").mockImplementation(mockCleanupPool),
        vi.spyOn(PlaywrightBrowserPool.prototype, "getMetrics").mockImplementation(mockGetMetrics),
      ];

      mockAxiosGet = vi.fn();
      // Use mocked implementation signature
      vi.mocked(axios.get).mockImplementation(mockAxiosGet as any);

      // Get the mocked constructor instance
      browserPoolMock = new PlaywrightBrowserPool();
      // Mock acquirePage for default success case
      vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(createMockPage());

      // Ensure the engine constructor uses the mocked pool
      vi.mocked(PlaywrightBrowserPool).mockImplementation(() => browserPoolMock);
    });

    // Restore spies after each test
    afterEach(async () => {
      spies.forEach((spy) => spy.mockRestore());
      if (engine) {
        await engine.cleanup(); // Ensure engine resources are released
      }
      vi.restoreAllMocks();
    });

    it("should initialize the browser pool on first fetch and return content", async () => {
      engine = new PlaywrightEngine({ useHttpFallback: false }); // Test without fallback initially
      const url = "http://example-success.com";
      const expectedHtml = "<html><body>Success</body></html>";
      const expectedTitle = "Success Title";
      const mockPage = createMockPage();

      mockAcquirePage.mockResolvedValue(mockPage);
      // Mock axios fallback - though not used here due to useHttpFallback: false
      mockAxiosGet.mockRejectedValue(new Error("Axios fallback failed"));

      const result = await engine.fetchHTML(url);

      // Check prototype spies were involved
      expect(PlaywrightBrowserPool.prototype.initialize).toHaveBeenCalledTimes(1);
      expect(mockAcquirePage).toHaveBeenCalledTimes(1); // acquirePage spy
      expect(mockPage.goto).toHaveBeenCalledWith(url, expect.anything());
      expect(mockPage.close).toHaveBeenCalledTimes(1);

      expect(result).toEqual({
        html: expectedHtml,
        title: expectedTitle,
        url: url,
      });
      // Verify axios was NOT called for fallback attempt
      expect(mockAxiosGet).not.toHaveBeenCalled(); // Fallback explicitly disabled
    });

    it("should use HTTP fallback if enabled and successful", async () => {
      engine = new PlaywrightEngine({ useHttpFallback: true }); // Enable fallback
      const url = "http://example.com/fallback-works";
      const fallbackHtml = "<html><head><title>Fallback Title</title></head><body>Fallback HTML</body></html>";

      // Setup successful axios fallback
      mockAxiosGet.mockResolvedValue({
        data: fallbackHtml,
        status: 200,
        headers: { "content-type": "text/html" },
        request: { res: { responseUrl: url } },
        config: { url: url },
      });

      const result = await engine.fetchHTML(url);

      expect(mockAcquirePage).not.toHaveBeenCalled(); // Browser pool should not be used
      expect(mockAxiosGet).toHaveBeenCalledTimes(1);
      expect(mockAxiosGet).toHaveBeenCalledWith(url, expect.anything());
      expect(result.title).toBe("Fallback Title"); // Title extracted by fallback regex
      expect(result.html).toBe(fallbackHtml);
      expect(result.url).toBe(url);
    });

    it("should retry browser fetch if initial attempt fails and fallback also fails", async () => {
      // Explicitly configure retries and delay for predictability
      engine = new PlaywrightEngine({
        useHttpFallback: true,
        maxRetries: 1, // Allow 1 retry (2 total attempts)
        retryDelay: 100, // Short delay (won't be hit due to FAST->THOROUGH)
      });

      const url = "http://example.com/retry";
      const expectedHtml = "<html><body>Retry Success</body></html>";
      const expectedTitle = "Retry Title";
      const mockPage = createMockPage();
      const failureError = new Error("Initial fetch failed");

      // Fail first browser attempt (FAST mode), succeed second (THOROUGH mode)
      // Note: acquirePage is called for *both* FAST and THOROUGH in the first attempt
      mockAcquirePage
        .mockRejectedValueOnce(failureError) // Fails in FAST
        .mockResolvedValueOnce(mockPage); // Succeeds in THOROUGH

      // Fail axios fallback
      mockAxiosGet.mockRejectedValue(new Error("Axios fallback failed"));

      const result = await engine.fetchHTML(url); // Await directly

      expect(mockAxiosGet).toHaveBeenCalledTimes(2); // Fallback tried at start of FAST and start of THOROUGH
      expect(mockAcquirePage).toHaveBeenCalledTimes(2); // Called for FAST (fail) then THOROUGH (success)
      expect(mockPage.goto).toHaveBeenCalledTimes(1); // Only called on the successful THOROUGH attempt
      expect(result.title).toBe(expectedTitle);
      expect(result.html).toBe(expectedHtml);
    });

    it("should exhaust retries and throw if browser fetch consistently fails", async () => {
      const maxRetries = 1; // 2 total attempts
      const retryDelay = 100;
      engine = new PlaywrightEngine({
        useHttpFallback: true,
        maxRetries: maxRetries,
        retryDelay: retryDelay,
      });
      const url = "http://example.com/persistent-fail";
      const failureError = new Error("Browser fetch failed persistently");

      mockAcquirePage.mockRejectedValue(failureError); // Always fail
      mockAxiosGet.mockRejectedValue(new Error("Axios fallback failed")); // Always fail fallback

      vi.useFakeTimers();
      const fetchPromise = engine.fetchHTML(url);

      const maxAttempts = maxRetries + 1; // 2
      // Need to advance timers ONLY for the delay *between* overall attempts
      // Attempt 1 (FAST -> THOROUGH) happens without delay.
      // Then delay happens. Then Attempt 2 (FAST -> THOROUGH) happens.
      if (maxRetries > 0) {
        // Only advance if retries > 0
        await vi.advanceTimersByTimeAsync(retryDelay + 10);
      }
      // Removed the loop for advancing timers multiple times

      // Final error message should reflect the *last* error encountered
      // In this case, the error comes from the _fetchWithBrowser call (mockAcquirePage rejection)
      await expect(fetchPromise).rejects.toThrow(
        `Failed to fetch ${url} after ${maxAttempts} attempts: ${failureError.message}` // Check error message carefully
      );
      vi.useRealTimers();

      // Fallback called at start of attempt 1 and start of attempt 2
      expect(mockAxiosGet).toHaveBeenCalledTimes(2);
      // acquirePage called for FAST (fails), THOROUGH (fails) on attempt 1, then THOROUGH (fails) on attempt 2
      expect(mockAcquirePage).toHaveBeenCalledTimes(3);
    });

    it("should call pool cleanup when engine cleanup is called", async () => {
      engine = new PlaywrightEngine(); // Create default engine for this test

      // --- Add initialization step ---
      const initUrl = "http://example.com/initpool";
      const mockInitPage = createMockPage();
      mockAxiosGet.mockRejectedValueOnce(new Error("Axios fallback failed for init")); // Ensure browser path
      mockAcquirePage.mockResolvedValueOnce(mockInitPage); // Provide a page
      try {
        await engine.fetchHTML(initUrl);
      } catch (e) {
        /* Ignore errors during init fetch */
      }
      // Reset mocks if needed, although clearAllMocks runs in next beforeEach
      mockAxiosGet.mockClear(); // Clear init call history
      mockAcquirePage.mockClear();
      // --- End initialization step ---

      await engine.cleanup();
      // Check prototype spy was called
      expect(PlaywrightBrowserPool.prototype.cleanup).toHaveBeenCalledTimes(1);
      expect(mockCleanupPool).toHaveBeenCalledTimes(1); // Check the specific mock function too
    });

    it("should handle errors during HTTP fallback", async () => {
      // Mock fetchHTMLWithHttpFallback to reject
      vi.spyOn(PlaywrightEngine.prototype as any, "fetchHTMLWithHttpFallback").mockRejectedValue(
        new Error("HTTP Fallback Failed")
      );

      engine = new PlaywrightEngine({ useHttpFallback: true });
      // We expect it to fail the fallback, then proceed to playwright (which is mocked to succeed)
      const result = await engine.fetchHTML("http://example.com/fail-fallback");
      expect(result).toBeDefined(); // Should still succeed via Playwright mock
      expect(PlaywrightBrowserPool.prototype.acquirePage).toHaveBeenCalled();
    });

    it("should handle pool acquirePage errors", async () => {
      // Mock acquirePage to reject
      vi.mocked(PlaywrightBrowserPool.prototype.acquirePage).mockRejectedValue(new Error("Pool Error"));
      engine = new PlaywrightEngine({ useHttpFallback: false }); // Disable fallback

      await expect(engine.fetchHTML("http://example.com/pool-error")).rejects.toThrow(
        /Fetch failed after/ // Check for the final error message after retries
      );
      expect(PlaywrightBrowserPool.prototype.acquirePage).toHaveBeenCalledTimes(1 + 3); // Initial + 3 retries
    });

    it("should handle page.goto errors", async () => {
      // Mock page.goto to reject
      const mockPage = createMockPage();
      vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage);
      vi.mocked(mockPage.goto).mockRejectedValue(new Error("Navigation Failed"));

      engine = new PlaywrightEngine({ useHttpFallback: false });
      await expect(engine.fetchHTML("http://example.com/goto-error")).rejects.toThrow(
        /Fetch failed after/ // Final error after retries
      );
      expect(mockPage.goto).toHaveBeenCalledTimes(1 + 3); // Initial + 3 retries
    });

    // Example for testing retry logic
    it("should exhaust retries and throw if browser fetch consistently fails", async () => {
      const mockPage = createMockPage();
      vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage);
      vi.mocked(mockPage.goto).mockRejectedValue(new Error("Consistent Fail"));

      engine = new PlaywrightEngine({
        maxRetries: 2,
        retryDelay: 10,
        useHttpFallback: false,
      }); // 2 retries

      await expect(engine.fetchHTML("http://example.com/retry-fail")).rejects.toThrow(
        /Fetch failed after 2 retries: Playwright navigation failed: Consistent Fail/
      );

      // acquirePage called once initially
      // goto called initial + 2 retries = 3 times
      expect(browserPoolMock.acquirePage).toHaveBeenCalledTimes(1);
      expect(mockPage.goto).toHaveBeenCalledTimes(3);
    });

    it("should switch to thorough mode on first fast mode failure", async () => {
      const mockPage = createMockPage();
      vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage);
      // Fail once, then succeed
      vi.mocked(mockPage.goto)
        .mockRejectedValueOnce(new Error("Fast Mode Fail"))
        .mockResolvedValue(createMockResponse()); // Succeed on second (thorough) try
      vi.mocked(mockPage.content).mockResolvedValue("<html>Thorough Success</html>");
      vi.mocked(mockPage.title).mockResolvedValue("Thorough Title");

      engine = new PlaywrightEngine({
        defaultFastMode: true,
        maxRetries: 1,
        retryDelay: 10,
        useHttpFallback: false,
      });

      // Mock simulateHumanBehavior before calling fetchHTML
      const simulateSpy = vi.spyOn(engine as any, "simulateHumanBehavior").mockResolvedValue(undefined);

      const result = await engine.fetchHTML("http://example.com/fast-fail");

      expect(mockPage.goto).toHaveBeenCalledTimes(2);
      expect(result.html).toBe("<html>Thorough Success</html>");
      expect(result.title).toBe("Thorough Title");
      // Check simulateHumanBehavior was called on the second (thorough) attempt
      expect(simulateSpy).toHaveBeenCalledTimes(1);

      simulateSpy.mockRestore(); // Clean up spy
    });

    // TODO: Test headed mode fallback logic
    // TODO: Test caching logic
  },
  {
    // Increase timeout for tests involving retries and delays
    timeout: 20000,
  }
);

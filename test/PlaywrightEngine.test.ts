/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mocked } from "vitest";
import { PlaywrightEngine } from "../src/PlaywrightEngine.js";
import { PlaywrightBrowserPool } from "../src/browser/PlaywrightBrowserPool.js";
import type { AxiosRequestConfig } from "axios";
import axios from "axios"; // Import real axios
import type { Page, Response as PlaywrightResponse } from "playwright";
import PQueue from "p-queue";
import type { MockInstance } from "vitest"; // Import MockInstance
import type { HTMLFetchResult } from "../src/types.js"; // Added import for HTMLFetchResult
import type { BrowserMetrics } from "../src/types.js"; // Added import for BrowserMetrics

// Mock dependencies
vi.mock("../src/browser/PlaywrightBrowserPool.js");
vi.mock("p-queue");

const MockedPlaywrightBrowserPool = vi.mocked(PlaywrightBrowserPool);
let mockedAxiosGet: MockInstance<typeof axios.get>; // Use MockInstance type
const MockedPQueue = vi.mocked(PQueue);

// Declare defaultPlaywrightResponse in the describe scope so it can be accessed by tests
let defaultPlaywrightResponse: PlaywrightResponse;

// Helper to create a mock Playwright Page
const createMockPage = (overrides: Partial<Mocked<Page>> = {}): Mocked<Page> => {
  const page: Partial<Mocked<Page>> = {
    goto: vi.fn().mockResolvedValue(null), // Default success
    content: vi.fn().mockResolvedValue("<html><head><title>Mock Page</title></head><body>Mock Content</body></html>"),
    title: vi.fn().mockResolvedValue("Mock Page"),
    url: vi.fn().mockReturnValue("http://mockedurl.com"), // Add default mock for url()
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    route: vi.fn().mockImplementation(async (_url, _handler) => {}), // Added route mock, params unused
    context: vi.fn().mockReturnValue({
      browser: vi.fn().mockReturnValue({
        isConnected: vi.fn().mockReturnValue(true),
      }),
    }),
    // Add other methods as needed for tests
    ...overrides,
  };
  return page as Mocked<Page>;
};

// Helper to create mock Axios response
const createMockAxiosResponse = (data: string, status: number, headers: Record<string, string> = {}, url?: string) => ({
  data,
  status,
  headers,
  config: { url: url ?? "http://fallback.com" } as AxiosRequestConfig,
  statusText: "OK",
  request: { res: { responseUrl: url } }, // Simulate final URL via request obj
});

describe("PlaywrightEngine", () => {
  let engine: PlaywrightEngine;
  let mockPoolInstance: Mocked<PlaywrightBrowserPool>;
  let mockPage: Mocked<Page>;
  let mockQueueAdd: Mocked<PQueue["add"]>;

  const defaultUrl = "http://example.com";
  const defaultHtml =
    "<html><head><title>Default Test Page</title></head><body><h1>Heading 1</h1><p>Some paragraph.</p></body></html>";
  const defaultTitle = "Default Test Page";

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();

    // Spy on the actual axios.get method
    mockedAxiosGet = vi.spyOn(axios, "get");
    mockedAxiosGet.mockResolvedValue(
      createMockAxiosResponse(defaultHtml, 200, { "content-type": "text/html" }, defaultUrl)
    );

    mockQueueAdd = vi.fn().mockImplementation((fnToExecute) => fnToExecute());
    MockedPQueue.mockImplementation(
      () =>
        ({
          add: mockQueueAdd,
          onIdle: vi.fn().mockResolvedValue(undefined),
          size: 0,
          pending: 0,
          clear: vi.fn(), // Added clear mock
        }) as unknown as PQueue
    );

    mockPoolInstance = {
      initialize: vi.fn().mockResolvedValue(undefined),
      acquirePage: vi.fn(),
      releasePage: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<PlaywrightBrowserPool>;
    MockedPlaywrightBrowserPool.mockImplementation(() => mockPoolInstance);

    // Assign to the describe-scoped defaultPlaywrightResponse
    defaultPlaywrightResponse = {
      ok: () => true,
      status: () => 200,
      headers: () => ({ "content-type": "text/html" }),
      text: vi.fn().mockImplementation(async () => defaultHtml),
      json: vi.fn().mockImplementation(async () => ({})),
      body: vi.fn().mockImplementation(async () => Buffer.from(defaultHtml)),
    } as unknown as PlaywrightResponse;

    mockPage = createMockPage({
      goto: vi.fn().mockResolvedValue(defaultPlaywrightResponse),
      content: vi.fn().mockResolvedValue(defaultHtml),
      title: vi.fn().mockResolvedValue(defaultTitle),
      url: vi.fn().mockReturnValue(defaultUrl),
    });
    mockPoolInstance.acquirePage.mockResolvedValue(mockPage);

    engine = new PlaywrightEngine({ markdown: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any).cache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore the original implementation after each test
    mockedAxiosGet.mockRestore();
  });

  // --- Test Cases Start Here (ALL SKIPPED except first) ---

  // ONLY THIS TEST IS ACTIVE
  it("FR3.1: should instantiate with default configuration", () => {
    expect(MockedPlaywrightBrowserPool).not.toHaveBeenCalled();
    expect(engine).toBeDefined(); // Engine should be defined from beforeEach
    expect(MockedPQueue).toHaveBeenCalledTimes(1);
    expect(MockedPQueue).toHaveBeenCalledWith({ concurrency: 3 });
  });

  it("should instantiate with custom configuration", () => {
    const customConfig = {
      maxRetries: 5,
      requestTimeout: 15000,
      useHttpFallback: false,
      cacheTTL: 1000,
      playwrightLaunchOptions: { headless: true },
      maxBrowsers: 5,
      maxPagesPerContext: 10,
      concurrentPages: 1,
      markdown: false,
    };

    MockedPQueue.mockClear();

    const customEngine = new PlaywrightEngine(customConfig);

    expect(customEngine).toBeDefined();
    expect(MockedPQueue).toHaveBeenCalledTimes(1);
    expect(MockedPQueue).toHaveBeenCalledWith({ concurrency: customConfig.concurrentPages });

    const internalConfig = (customEngine as any).config;
    expect(internalConfig.maxRetries).toBe(customConfig.maxRetries);
    expect(internalConfig.requestTimeout).toBe(customConfig.requestTimeout);
    expect(internalConfig.useHttpFallback).toBe(customConfig.useHttpFallback);
    expect(internalConfig.cacheTTL).toBe(customConfig.cacheTTL);
    expect(internalConfig.playwrightLaunchOptions).toEqual(customConfig.playwrightLaunchOptions);
    expect(internalConfig.maxBrowsers).toEqual(customConfig.maxBrowsers);
    expect(internalConfig.maxPagesPerContext).toEqual(customConfig.maxPagesPerContext);
  });

  it("FR3.9: cleanup should cleanup the browser pool if initialized", async () => {
    // Create a new engine instance for this test to isolate pool creation
    MockedPlaywrightBrowserPool.mockClear();
    mockPoolInstance.initialize.mockClear(); // Clear mocks on the shared instance too
    mockPoolInstance.cleanup.mockClear();

    const localEngine = new PlaywrightEngine({ useHttpFallback: false, markdown: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (localEngine as any).cache.clear();

    // Trigger pool initialization by attempting a fetch
    try {
      // Ensure acquirePage on the global mockPoolInstance is set up for this call
      mockPoolInstance.acquirePage.mockResolvedValueOnce(mockPage);
      await localEngine.fetchHTML(defaultUrl);
    } catch {
      /* Expected to use mocked page, ignore fetch errors here, only care about pool init */
    }

    // Check that the PlaywrightBrowserPool constructor was called once for this localEngine
    expect(MockedPlaywrightBrowserPool).toHaveBeenCalledTimes(1);
    // Check that initialize was called on the instance returned by the mocked constructor
    expect(mockPoolInstance.initialize).toHaveBeenCalledTimes(1);

    await localEngine.cleanup();
    expect(mockPoolInstance.cleanup).toHaveBeenCalledTimes(1);
  });

  it("FR3.9: cleanup should not throw if pool was never initialized", async () => {
    const newEngine = new PlaywrightEngine(); // Pool not initialized yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newEngine as any).browserPool = null; // Explicitly ensure pool is null

    await expect(newEngine.cleanup()).resolves.toBeUndefined();
    // Check that the mocked pool's cleanup was not called for this newEngine instance
    // This requires ensuring mockPoolInstance is not somehow globally affected or re-mock per newEngine.
    // Since mockPoolInstance is shared, this assertion might be tricky if other tests affect it.
    // A fresh mock for a pool that newEngine would create would be better.
    // For now, we just check it doesn't throw.
  });

  it("getMetrics should return metrics from the pool if initialized", async () => {
    // Create a new engine for isolation
    MockedPlaywrightBrowserPool.mockClear();
    mockPoolInstance.initialize.mockClear();
    mockPoolInstance.getMetrics.mockClear();

    const localEngine = new PlaywrightEngine({ useHttpFallback: false, markdown: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (localEngine as any).cache.clear();

    const mockMetrics: BrowserMetrics[] = [
      {
        id: "metric1",
        pagesCreated: 1,
        activePages: 1,
        lastUsed: new Date(),
        createdAt: new Date(),
        errors: 0,
        isHealthy: true,
      },
    ];
    // Ensure the global mockPoolInstance (returned by the mocked constructor) is set up
    mockPoolInstance.getMetrics.mockReturnValue(mockMetrics);

    // Trigger pool initialization
    try {
      mockPoolInstance.acquirePage.mockResolvedValueOnce(mockPage);
      await localEngine.fetchHTML(defaultUrl);
    } catch {
      /* ignore, only care about pool init */
    }

    expect(MockedPlaywrightBrowserPool).toHaveBeenCalledTimes(1); // Constructor for localEngine's pool
    expect(mockPoolInstance.initialize).toHaveBeenCalledTimes(1); // On the instance created

    const metrics = localEngine.getMetrics();
    expect(mockPoolInstance.getMetrics).toHaveBeenCalledTimes(1);
    expect(metrics).toEqual(mockMetrics);
  });

  it("getMetrics should return empty array if pool not initialized", () => {
    const newEngine = new PlaywrightEngine();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (newEngine as any).browserPool = null; // Ensure pool is null

    const metrics = newEngine.getMetrics();
    expect(metrics).toEqual([]);
    // Ensure the global mockPoolInstance.getMetrics wasn't called for this newEngine
    // This depends on mockPoolInstance not being used by newEngine unless fetchHTML is called.
  });

  // --- Fetching Logic Tests ---
  // UN-SKIP THIS TEST
  it("FR3.1: should fetch using Playwright when HTTP fallback is disabled", async () => {
    engine = new PlaywrightEngine({ useHttpFallback: false, markdown: false });
    const specificDefaultHtml = "<html><title>Default</title><body>Default Content</body></html>";
    const specificDefaultTitle = "Default";

    const mockPlaywrightResponse = {
      ok: () => true,
      status: () => 200,
      headers: () => ({ "content-type": "text/html" }),
      text: vi.fn().mockResolvedValue(specificDefaultHtml),
    } as unknown as PlaywrightResponse;

    const specificMockPage = createMockPage({
      goto: vi.fn().mockResolvedValue(mockPlaywrightResponse),
      content: vi.fn().mockReturnValue(specificDefaultHtml),
      title: vi.fn().mockReturnValue(specificDefaultTitle),
    });
    mockPoolInstance.acquirePage.mockReset(); // Clear before setting new mock for this test
    mockPoolInstance.acquirePage.mockResolvedValue(specificMockPage);
    // mockPoolInstance.releasePage = vi.fn().mockResolvedValue(undefined); // Already in createMockPage implicitly

    const result = await engine.fetchHTML(defaultUrl);

    expect(mockedAxiosGet).not.toHaveBeenCalled();
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(specificMockPage.goto).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    expect(mockPlaywrightResponse.text).toHaveBeenCalledTimes(1);
    expect(specificMockPage.title).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(specificDefaultHtml);
    expect(result.title).toBe(specificDefaultTitle);
    expect(result.isFromCache).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.statusCode).toBe(200);
  }, 60000); // Keep increased timeout for now, just in case

  // KEEP OTHERS SKIPPED
  it("FR3.7: should use HTTP fallback successfully when enabled (default)", async () => {
    // Engine from beforeEach has HTTP fallback enabled by default
    // mockedAxiosGet from beforeEach already mocks a successful HTML response
    const result = await engine.fetchHTML(defaultUrl);

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockedAxiosGet).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    expect(mockPoolInstance.acquirePage).not.toHaveBeenCalled(); // Playwright should not be used

    expect(result.content).toBe(defaultHtml); // From mocked Axios
    expect(result.title).toBe(defaultTitle); // Title from mocked Axios HTML
    expect(result.contentType).toBe("html");
    expect(result.statusCode).toBe(200);
    expect(result.url).toBe(defaultUrl); // Final URL from Axios
    expect(result.isFromCache).toBe(false);
    expect(result.error).toBeUndefined();
  });

  // For FR3.7 tests that expect to go to Playwright, we need to ensure the
  // mockPage provided by acquirePage (which is the global mockPage by default if not overridden)
  // has a goto() that resolves to a response with .text()

  it("FR3.7: should fallback to Playwright if HTTP fallback gets non-HTML", async () => {
    mockedAxiosGet.mockRejectedValue(new Error("Simulated Axios error for non-HTML content"));

    // The global mockPage set in beforeEach by default has .text() on its goto response.
    // We just need to ensure its content/title mocks are suitable for this fallback test.
    const fallbackContent = "<html><body>Fallback Playwright Content for non-HTML</body></html>";
    const fallbackTitle = "Fallback Page Title for non-HTML";

    // Redefine what the default mockPage.content and mockPage.title will return
    // The mockPage.goto().text() will return defaultHtml from the global beforeEach, which is fine.
    mockPage.content.mockResolvedValue(fallbackContent);
    mockPage.title.mockResolvedValue(fallbackTitle);
    // No need to mock acquirePage again if global mockPage is sufficient and already acquired.
    // Ensure acquirePage returns the globally configured mockPage if it wasn't reset.
    mockPoolInstance.acquirePage.mockReset(); // Reset to clear previous test specific mocks if any
    mockPoolInstance.acquirePage.mockResolvedValue(mockPage); // Explicitly use global mockPage

    const result = await engine.fetchHTML(defaultUrl); // engine is markdown:false from global beforeEach

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(mockPage.goto).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    // Since markdown:false and content-type is html (from defaultPlaywrightResponse), response.text() should be called.
    expect(defaultPlaywrightResponse.text).toHaveBeenCalled();
    expect(result.content).toBe(defaultHtml); // It will take content from response.text()
    expect(result.title).toBe(fallbackTitle); // Title from page.title()
    expect(result.error).toBeUndefined();
  });

  it("FR3.7: should fallback to Playwright if HTTP fallback gets challenge page", async () => {
    // engine.browserPool = null; // This might be problematic / better handled by mocks - Kept commented
    // engine.isUsingHeadedMode = false; // Kept commented

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engine as any).cache.clear(); // Clear cache specifically for this test too

    mockedAxiosGet.mockResolvedValue(
      createMockAxiosResponse(
        "<html><head><title>Challenge</title></head><body>Please verify you are human, maybe Cloudflare or reCAPTCHA here.</body></html>",
        200,
        { "content-type": "text/html" },
        defaultUrl
      )
    );
    const fallbackContentChallenge =
      "<html><title>Actual Content</title><body>Fallback Playwright Content After Challenge</body></html>";
    const fallbackTitleChallenge = "Actual Content"; // Title from Playwright's fetch

    const mockChallengeResponseText = vi.fn().mockResolvedValue(fallbackContentChallenge);
    // Ensure the mockPage (returned by acquirePage) returns the correct Playwright content and title
    const challengeSpecificMockPage = createMockPage({
      goto: vi.fn().mockResolvedValue({
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "text/html" }),
        text: mockChallengeResponseText,
      } as unknown as PlaywrightResponse),
      content: vi.fn().mockResolvedValue(fallbackContentChallenge), // This won't be called
      title: vi.fn().mockResolvedValue(fallbackTitleChallenge),
      url: vi.fn().mockReturnValue(defaultUrl),
    });

    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage.mockResolvedValue(challengeSpecificMockPage);

    const result = await engine.fetchHTML(defaultUrl); // engine is markdown:false from global beforeEach

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1); // HTTP fallback is tried once
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1); // Playwright should be used
    expect(challengeSpecificMockPage.goto).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    // If markdown: false, PlaywrightEngine._fetchWithPlaywright directly uses page.content()
    expect(mockChallengeResponseText).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(fallbackContentChallenge);
    expect(result.title).toBe(fallbackTitleChallenge);
    expect(result.error).toBeUndefined();
    expect(result.statusCode).toBe(200);
  });

  it("FR3.7: should fallback to Playwright if HTTP fallback fails (e.g., 403)", async () => {
    const error403 = new Error("Simulated 403 Forbidden from Axios");
    mockedAxiosGet.mockRejectedValue(error403);

    const fallbackContent403 =
      "<html><title>403 Fallback Title</title><body>Fallback Playwright Content After 403</body></html>";
    const fallbackTitle403 = "403 Fallback Title";

    const mockErrorResponseText = vi.fn().mockResolvedValue(fallbackContent403);
    // Specific mock page for this scenario
    const errorFallbackPage = createMockPage({
      goto: vi.fn().mockResolvedValue({
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "text/html" }),
        text: mockErrorResponseText,
      } as unknown as PlaywrightResponse),
      content: vi.fn().mockResolvedValue(fallbackContent403), // This won't be called
      title: vi.fn().mockResolvedValue(fallbackTitle403),
      url: vi.fn().mockReturnValue(defaultUrl),
    });

    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage.mockResolvedValue(errorFallbackPage);

    const result = await engine.fetchHTML(defaultUrl); // engine has markdown: false by default

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(errorFallbackPage.goto).toHaveBeenCalledWith(defaultUrl, expect.any(Object));
    expect(mockErrorResponseText).toHaveBeenCalledTimes(1);
    expect(errorFallbackPage.title).toHaveBeenCalledTimes(1);
    expect(defaultPlaywrightResponse.text).not.toHaveBeenCalled(); // page.goto().text() should not be the source for final content

    expect(result.content).toBe(fallbackContent403);
    expect(result.title).toBe(fallbackTitle403);
    expect(result.error).toBeUndefined();
    expect(result.statusCode).toBe(200); // Assuming Playwright fetch is successful (200)
  });

  it("should throw original Playwright error if HTTP fallback is disabled and Playwright fails", async () => {
    const playwrightError = new Error("Playwright Navigation Timeout");

    // acquirePage will be called, and it will be mocked to throw an error.
    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage.mockRejectedValue(playwrightError);

    // Engine configured to not use HTTP fallback and to have no retries for Playwright attempts.
    const currentEngine = new PlaywrightEngine({
      useHttpFallback: false,
      markdown: false,
      maxRetries: 0,
      defaultFastMode: false, // Added to prevent fastMode retry
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (currentEngine as any).cache.clear();

    await expect(currentEngine.fetchHTML(defaultUrl)).rejects.toMatchObject({
      name: "FetchError",
      code: "ERR_PLAYWRIGHT_OPERATION", // Corrected expected error code
      message: expect.stringContaining(playwrightError.message),
      originalError: playwrightError,
    });

    expect(mockedAxiosGet).not.toHaveBeenCalled();
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1); // Only one attempt due to maxRetries: 0
  });

  it("FR3.4: should return cached result if valid", async () => {
    // First call (populates cache)
    await engine.fetchHTML(defaultUrl);
    mockPoolInstance.acquirePage.mockClear(); // Clear calls from first fetch

    // Second call (should hit cache)
    const result = await engine.fetchHTML(defaultUrl);

    expect(mockPoolInstance.acquirePage).not.toHaveBeenCalled();
    expect(result.isFromCache).toBe(true);
    expect(result.content).toBe(defaultHtml);
    expect(result.contentType).toBe("html"); // Check cached contentType
    expect(result.title).toBe(defaultTitle);
  });

  it("FR3.4: should fetch again if cache expired", async () => {
    vi.useFakeTimers();
    const cacheTTLExpired = 50; // ms
    const expiredEngine = new PlaywrightEngine({ cacheTTL: cacheTTLExpired, useHttpFallback: false, markdown: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (expiredEngine as any).cache.clear();

    // Initial fetch to populate cache
    mockPoolInstance.acquirePage.mockResolvedValue(mockPage); // Ensure mockPage is used
    await expiredEngine.fetchHTML(defaultUrl);
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);

    // Advance time beyond cache TTL
    vi.advanceTimersByTime(cacheTTLExpired + 10);

    mockPoolInstance.acquirePage.mockClear(); // Clear calls from first fetch
    mockPoolInstance.acquirePage.mockResolvedValue(mockPage); // Re-mock for the second call

    // Second fetch, should be fresh
    const result = await expiredEngine.fetchHTML(defaultUrl);
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(result.isFromCache).toBe(false);
    expect(result.content).toBe(defaultHtml);
    vi.useRealTimers();
  });

  it("FR3.4.2: should not use cache if TTL is 0", async () => {
    const noCacheEngine = new PlaywrightEngine({ cacheTTL: 0, useHttpFallback: false, markdown: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (noCacheEngine as any).cache.clear();

    mockPoolInstance.acquirePage.mockResolvedValue(mockPage);
    await noCacheEngine.fetchHTML(defaultUrl); // First call
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);

    mockPoolInstance.acquirePage.mockClear();
    mockPoolInstance.acquirePage.mockResolvedValue(mockPage); // Re-mock for the second call

    const result = await noCacheEngine.fetchHTML(defaultUrl); // Second call
    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(result.isFromCache).toBe(false);
  });

  it("FR3.3: should retry Playwright fetch on failure", async () => {
    const retryEngine = new PlaywrightEngine({ maxRetries: 1, useHttpFallback: false, markdown: false }); // 1 retry = 2 attempts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (retryEngine as any).cache.clear();

    const error = new Error("Simulated Playwright failure for retry");
    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage
      .mockRejectedValueOnce(error) // First attempt fails
      .mockResolvedValue(mockPage); // Second attempt succeeds

    const result = await retryEngine.fetchHTML(defaultUrl);

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(defaultHtml);
    expect(result.error).toBeUndefined();
  });

  it("should throw FetchError after exhausting retries (Playwright path)", async () => {
    const maxRetriesConfig = 1;
    const exhaustedRetryEngine = new PlaywrightEngine({
      maxRetries: maxRetriesConfig,
      useHttpFallback: false,
      markdown: false,
      defaultFastMode: false, // Added to prevent fastMode retry
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (exhaustedRetryEngine as any).cache.clear();

    const error = new Error("Simulated persistent Playwright failure");
    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage.mockRejectedValue(error); // All attempts fail

    await expect(exhaustedRetryEngine.fetchHTML(defaultUrl)).rejects.toMatchObject({
      name: "FetchError",
      code: "ERR_PLAYWRIGHT_OPERATION", // Corrected expected error code
      message: expect.stringContaining(error.message),
      originalError: error,
    });

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(maxRetriesConfig + 1);
  });

  it("FR3.6: should initialize the pool with correct config from engine options", async () => {
    // These are individual properties on PlaywrightEngineConfig that affect the pool
    const enginePoolRelatedConfig = {
      maxBrowsers: 1,
      maxPagesPerContext: 1,
      healthCheckInterval: 10000,
      playwrightLaunchOptions: { headless: true, args: ["--no-sandbox"] },
      // proxy: { server: "http://myproxy.com" } // example if proxy was needed
    };

    const engineWithCustomPoolConfig = new PlaywrightEngine({
      ...enginePoolRelatedConfig,
      useHttpFallback: false,
      markdown: false, // Simplify to force pool use
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (engineWithCustomPoolConfig as any).cache.clear();

    let capturedPoolConstructorArgs: any = null;
    const originalPoolMock = MockedPlaywrightBrowserPool.getMockImplementation();

    MockedPlaywrightBrowserPool.mockImplementationOnce((constructorConfig: any) => {
      capturedPoolConstructorArgs = constructorConfig;
      return {
        initialize: vi.fn().mockResolvedValue(undefined),
        acquirePage: vi.fn().mockResolvedValue(mockPage),
        releasePage: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue(undefined),
        getMetrics: vi.fn().mockReturnValue([]),
      } as unknown as Mocked<PlaywrightBrowserPool>;
    });

    try {
      await engineWithCustomPoolConfig.fetchHTML(defaultUrl);
    } catch {
      /* ignore errors, focus on init call */
    }

    expect(MockedPlaywrightBrowserPool).toHaveBeenCalled();
    expect(capturedPoolConstructorArgs).not.toBeNull();
    if (capturedPoolConstructorArgs) {
      expect(capturedPoolConstructorArgs.maxBrowsers).toBe(enginePoolRelatedConfig.maxBrowsers);
      expect(capturedPoolConstructorArgs.maxPagesPerContext).toBe(enginePoolRelatedConfig.maxPagesPerContext);
      expect(capturedPoolConstructorArgs.healthCheckInterval).toBe(enginePoolRelatedConfig.healthCheckInterval);
      expect(capturedPoolConstructorArgs.launchOptions).toEqual(enginePoolRelatedConfig.playwrightLaunchOptions);
      // expect(capturedPoolConstructorArgs.proxy).toEqual(enginePoolRelatedConfig.proxy);
    }

    if (originalPoolMock) {
      MockedPlaywrightBrowserPool.mockImplementation(originalPoolMock);
    }
  });

  it("FR3.8: should not switch to headed mode fallback if disabled (useHeadedModeFallback: false)", async () => {
    const noHeadedFallbackEngine = new PlaywrightEngine({
      useHeadedModeFallback: false, // Explicitly disable
      maxRetries: 0, // No retries for the initial attempt
      useHttpFallback: false,
      markdown: false, // Force Playwright path
      defaultFastMode: false, // Added to prevent fastMode retry
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (noHeadedFallbackEngine as any).cache.clear();

    const playwrightError = new Error("Initial Playwright fetch failed");
    mockPoolInstance.acquirePage.mockReset();
    mockPoolInstance.acquirePage.mockRejectedValue(playwrightError);

    // Spy on the engine's internal initializeBrowserPool to see if it's called for headed mode
    // This requires making it directly spiable or checking its effects.
    const initializeSpy = vi.spyOn(noHeadedFallbackEngine as any, "initializeBrowserPool");

    await expect(noHeadedFallbackEngine.fetchHTML(defaultUrl)).rejects.toMatchObject({
      originalError: playwrightError,
    });

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1); // Changed from 2 to 1
    // Check initializeBrowserPool was called for headless, but not again for headed
    expect(initializeSpy).toHaveBeenCalledWith(false); // Initial call with useHeadedMode: false
    // initializeBrowserPool has guards; even if _ensureBrowserPoolInitialized is called multiple times by _fetchRecursive,
    // the actual pool re-initialization (and thus the core of initializeBrowserPool) should only run if mode changes or not initialized.
    // For two headless attempts, it should effectively initialize fully once.
    expect(initializeSpy).toHaveBeenCalledTimes(1); // Should still be 1 for actual re-init logic for the *same* mode.
    initializeSpy.mockRestore();
  });

  it("FR3.8: should switch to headed mode fallback if enabled and Playwright fails", async () => {
    const headedFallbackEngine = new PlaywrightEngine({
      useHeadedModeFallback: true,
      maxRetries: 0, // No retries for the initial headless attempt to simplify test
      useHttpFallback: false,
      markdown: false,
      defaultFastMode: false, // Added to prevent fastMode retry
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (headedFallbackEngine as any).cache.clear();

    const initialPlaywrightError = new Error("Initial (headless) Playwright fetch failed");

    const headlessPoolInstance = {
      initialize: vi.fn().mockResolvedValue(undefined),
      acquirePage: vi.fn().mockRejectedValueOnce(initialPlaywrightError), // Headless fails once
      releasePage: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<PlaywrightBrowserPool>;

    const headedPageContent = "<html><title>Headed Fallback Content</title><body>Success from headed!</body></html>";
    const headedPageTitle = "Headed Fallback Content";

    const mockHeadedResponse = {
      ok: () => true,
      status: () => 200,
      headers: () => ({ "content-type": "text/html" }),
      text: vi.fn().mockResolvedValue(headedPageContent), // text() should provide headedPageContent
      json: vi.fn().mockResolvedValue({}),
      body: vi.fn().mockResolvedValue(Buffer.from(headedPageContent)),
    } as unknown as PlaywrightResponse;

    const headedMockPage = createMockPage({
      // content: vi.fn().mockResolvedValue(headedPageContent), // This is not called when markdown: false
      title: vi.fn().mockResolvedValue(headedPageTitle), // page.title() is still used by the engine
      // goto: vi.fn().mockResolvedValue(defaultPlaywrightResponse), // Ensure goto resolves, removed 'as any' // Replaced below
      goto: vi.fn().mockResolvedValue(mockHeadedResponse), // goto now resolves with the mockHeadedResponse
    });

    const headedPoolInstance = {
      initialize: vi.fn().mockResolvedValue(undefined),
      acquirePage: vi.fn().mockResolvedValue(headedMockPage), // Headed succeeds
      releasePage: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<PlaywrightBrowserPool>;

    const originalPoolMock = MockedPlaywrightBrowserPool.getMockImplementation();
    let headlessAttemptDone = false;

    MockedPlaywrightBrowserPool.mockImplementation((poolConfig: any) => {
      if (poolConfig && poolConfig.useHeadedMode) {
        expect(headlessAttemptDone).toBe(true); // Ensure headless was tried before headed pool is created
        return headedPoolInstance;
      }
      headlessAttemptDone = true;
      return headlessPoolInstance;
    });

    const result = await headedFallbackEngine.fetchHTML(defaultUrl);

    expect(headlessPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(headedPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    // initialize on the pool instance itself is called by the pool's constructor logic or an explicit call.
    // The engine calls its own initializeBrowserPool, which then news up a pool which initializes itself.
    // So, we check the initialize methods on the *mocked pool instances*.
    expect(headlessPoolInstance.initialize).toHaveBeenCalledTimes(1);
    expect(headedPoolInstance.initialize).toHaveBeenCalledTimes(1);

    expect(result.content).toBe(headedPageContent);
    expect(result.title).toBe(headedPageTitle);
    expect(result.error).toBeUndefined();

    if (originalPoolMock) {
      MockedPlaywrightBrowserPool.mockImplementation(originalPoolMock);
    }
  });

  // --- New Tests for Markdown Conversion ---

  it("should fetch HTML when markdown is false (default)", async () => {
    engine = new PlaywrightEngine({ useHttpFallback: false, markdown: false });

    // Need to ensure the mock page's goto provides a response with .text()
    const mockHtmlResponse = {
      ok: () => true,
      status: () => 200,
      headers: () => ({ "content-type": "text/html" }),
      text: vi.fn().mockResolvedValue(defaultHtml),
    } as unknown as PlaywrightResponse;
    const customMockPage = createMockPage({
      goto: vi.fn().mockResolvedValue(mockHtmlResponse),
      content: vi.fn().mockResolvedValue(defaultHtml), // For potential markdown:true path if not careful
      title: vi.fn().mockResolvedValue(defaultTitle),
    });
    mockPoolInstance.acquirePage.mockReset(); // Clear global mock
    mockPoolInstance.acquirePage.mockResolvedValue(customMockPage);

    const result = await engine.fetchHTML(defaultUrl);

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(mockHtmlResponse.text).toHaveBeenCalledTimes(1); // Check .text() was called
    expect(result.content).toBe(defaultHtml);
    expect(result.contentType).toBe("html");
    expect(result.title).toBe(defaultTitle);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it("should fetch and convert HTML to Markdown via Playwright when markdown option is true in config", async () => {
    engine = new PlaywrightEngine({ markdown: true, useHttpFallback: false }); // Enable markdown in config
    const result = await engine.fetchHTML(defaultUrl);

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(result.contentType).toBe("markdown");
    expect(result.content).toContain("# Default Test Page");
    expect(result.content).toContain("# Heading 1");
    expect(result.content).not.toContain("<p>");
    expect(result.title).toBe(defaultTitle); // Title still extracted
    expect(result.statusCode).toBe(200);
  });

  it("should fetch and convert HTML to Markdown via Playwright using per-request option", async () => {
    engine = new PlaywrightEngine({ useHttpFallback: false }); // Default markdown is false
    const result = await engine.fetchHTML(defaultUrl, { markdown: true }); // Override per-request

    expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
    expect(result.contentType).toBe("markdown");
    expect(result.content).toContain("# Default Test Page");
    expect(result.content).toContain("# Heading 1");
    expect(result.title).toBe(defaultTitle);
  });

  it("should convert HTML from successful HTTP fallback if markdown option is true", async () => {
    engine = new PlaywrightEngine({ markdown: true }); // Enable markdown in config

    mockedAxiosGet.mockResolvedValue(
      createMockAxiosResponse(defaultHtml, 200, { "content-type": "text/html" }, defaultUrl)
    );
    const result = await engine.fetchHTML(defaultUrl);

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPoolInstance.acquirePage).not.toHaveBeenCalled();
    expect(result.contentType).toBe("markdown"); // Check fallback converted
    expect(result.content).toContain("# Default Test Page");
    expect(result.content).toContain("# Heading 1");
    expect(result.title).toBe(defaultTitle);
  });

  it("should return HTML from successful HTTP fallback if markdown option is false (default)", async () => {
    engine = new PlaywrightEngine({ markdown: false }); // Default markdown

    mockedAxiosGet.mockResolvedValue(
      createMockAxiosResponse(defaultHtml, 200, { "content-type": "text/html" }, defaultUrl)
    );
    const result = await engine.fetchHTML(defaultUrl);

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPoolInstance.acquirePage).not.toHaveBeenCalled();
    expect(result.contentType).toBe("html");
    expect(result.content).toBe(defaultHtml);
    expect(result.title).toBe(defaultTitle);
  });

  // --- Add new describe block for non-HTML content type tests ---
  describe("Non-HTML Content Type Handling", () => {
    const xmlContent = "<?xml version='1.0' encoding='UTF-8'?><root><item>Test XML</item></root>";
    const textContent = "This is plain text.";
    const xmlUrl = "http://example.com/test.xml";
    const textUrl = "http://example.com/test.txt";
    const imageUrl = "http://example.com/test.png";

    beforeEach(() => {
      // engine is re-initialized here for this describe block. ADD maxRetries:0 for error tests.
      // For success tests (XML, plain text), retries might be fine or could also be 0.
      // Let's make it default for this block unless overridden in a specific test.
      engine = new PlaywrightEngine({ markdown: false, useHttpFallback: false, maxRetries: 3 }); // Default retries for this block
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (engine as any).cache.clear();
    });

    it("should fetch XML content successfully when markdown: false", async () => {
      const mockXmlResponse = {
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "application/xml; charset=utf-8" }),
        text: vi.fn().mockResolvedValue(xmlContent),
      } as unknown as PlaywrightResponse;

      const specificMockPage = createMockPage({
        goto: vi.fn().mockResolvedValue(mockXmlResponse),
        content: vi.fn(), // content() should not be called for raw XML
        title: vi.fn().mockResolvedValue("XML Page Title"),
        url: vi.fn().mockReturnValue(xmlUrl),
      });
      mockPoolInstance.acquirePage.mockResolvedValue(specificMockPage);

      const result = await engine.fetchHTML(xmlUrl, { markdown: false });

      expect(mockPoolInstance.acquirePage).toHaveBeenCalledTimes(1);
      expect(specificMockPage.goto).toHaveBeenCalledWith(xmlUrl, expect.any(Object));
      expect(mockXmlResponse.text).toHaveBeenCalledTimes(1); // Assert on the response's text method
      expect(specificMockPage.content).not.toHaveBeenCalled();
      expect(result.content).toBe(xmlContent);
      expect(result.contentType).toBe("html");
      expect(result.title).toBe("XML Page Title");
      expect(result.statusCode).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it("should fetch plain text content successfully when markdown: false", async () => {
      const mockTextResponse = {
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "text/plain; charset=utf-8" }),
        text: vi.fn().mockResolvedValue(textContent),
      } as unknown as PlaywrightResponse;

      const specificMockPage = createMockPage({
        goto: vi.fn().mockResolvedValue(mockTextResponse),
        content: vi.fn(),
        title: vi.fn().mockResolvedValue("Text Page Title"),
        url: vi.fn().mockReturnValue(textUrl),
      });
      mockPoolInstance.acquirePage.mockResolvedValue(specificMockPage);

      const result = await engine.fetchHTML(textUrl, { markdown: false });

      expect(mockTextResponse.text).toHaveBeenCalledTimes(1);
      expect(specificMockPage.content).not.toHaveBeenCalled();
      expect(result.content).toBe(textContent);
      expect(result.contentType).toBe("html");
      expect(result.title).toBe("Text Page Title");
      expect(result.statusCode).toBe(200);
      expect(result.error).toBeUndefined();
    });

    it("should throw ERR_MARKDOWN_CONVERSION_NON_HTML when fetching XML with markdown: true", async () => {
      const mockXmlResponseForError = {
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "application/xml" }),
        text: vi.fn().mockResolvedValue(xmlContent),
      } as unknown as PlaywrightResponse;

      const specificMockPage = createMockPage({
        goto: vi.fn().mockResolvedValue(mockXmlResponseForError),
        content: vi.fn(),
        title: vi.fn().mockResolvedValue("XML Page Title"),
        url: vi.fn().mockReturnValue(xmlUrl),
      });
      mockPoolInstance.acquirePage.mockResolvedValue(specificMockPage);

      // ADD maxRetries: 0
      const markdownEngine = new PlaywrightEngine({ markdown: true, useHttpFallback: false, maxRetries: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (markdownEngine as any).cache.clear();

      await expect(markdownEngine.fetchHTML(xmlUrl, { markdown: true })).rejects.toMatchObject({
        code: "ERR_MARKDOWN_CONVERSION_NON_HTML",
        message: expect.stringContaining("Cannot convert non-HTML content type 'application/xml' to Markdown."),
      });
      // Optionally, check if text() was called or not depending on exact implementation detail
      // For now, focus is on the correct error being thrown.
    });

    it("should throw ERR_UNSUPPORTED_RAW_CONTENT_TYPE when fetching unsupported content with markdown: false", async () => {
      const mockImageResponse = {
        ok: () => true,
        status: () => 200,
        headers: () => ({ "content-type": "image/png" }),
        text: vi.fn().mockResolvedValue("giberish image data"),
      } as unknown as PlaywrightResponse;

      const specificMockPage = createMockPage({
        goto: vi.fn().mockResolvedValue(mockImageResponse),
        content: vi.fn(),
        title: vi.fn().mockResolvedValue("Image Page"),
        url: vi.fn().mockReturnValue(imageUrl),
      });
      mockPoolInstance.acquirePage.mockResolvedValue(specificMockPage);

      // engine for this block is useHttpFallback: false. Add maxRetries:0 specifically for this error test
      // or ensure the block's default engine has maxRetries: 0 if all error tests here need it
      const errorTestEngine = new PlaywrightEngine({ markdown: false, useHttpFallback: false, maxRetries: 0 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (errorTestEngine as any).cache.clear();

      await expect(errorTestEngine.fetchHTML(imageUrl, { markdown: false })).rejects.toMatchObject({
        code: "ERR_UNSUPPORTED_RAW_CONTENT_TYPE",
        message: expect.stringContaining("Raw content fetching not supported for content type: image/png"),
      });
    });
  });

  // Test for the default markdown true behavior of the engine if config.markdown = true
  // ... existing code ...
});

// --- SPA Mode Integration Tests ---
// These tests require an internet connection and may be slower.
// They use a real PlaywrightEngine instance.
// Remove .skip to run these tests locally.
describe.skip("PlaywrightEngine - SPA Mode Integration Tests", () => {
  let engine: PlaywrightEngine;
  const spaUrl = "https://www.smallblackdots.net/release/16109/corrina-joseph-wish-tonite-lonely";

  beforeEach(() => {
    // Important: Unmock PlaywrightBrowserPool and PQueue for these integration tests
    // This is a bit tricky with Vitest's module mocking. For a true integration test,
    // you might need to ensure these are not mocked at the top level for this describe block.
    // Or, instantiate PlaywrightEngine in a way that bypasses the mocks if possible.
    // For now, we assume PlaywrightEngine can be instantiated "normally" and will work if not mocked.
    // Vitest's vi.unmock doesn't work reliably inside describe blocks after top-level mocks.
    // The most reliable way is to have separate test files for unit vs integration or conditional mocking.
    // We will instantiate a real PlaywrightEngine here.
  });

  afterEach(async () => {
    if (engine) {
      await engine.cleanup();
    }
  });

  it("FR_SPA_1: should correctly fetch content from a live SPA site with spaMode enabled", async () => {
    engine = new PlaywrightEngine({
      spaMode: true,
      spaRenderDelayMs: 4000, // Give ample time for this specific site
      useHttpFallback: false, // Ensure Playwright is used directly for SPA test
      markdown: false,
    });

    let result: HTMLFetchResult | null = null;
    try {
      result = await engine.fetchHTML(spaUrl);
    } catch (error) {
      console.error("SPA Integration test failed during fetchHTML:", error);
      throw error; // Re-throw to fail the test
    }

    expect(result).not.toBeNull();
    if (!result) return; // Type guard

    expect(result.error).toBeUndefined();
    expect(result.statusCode).toBe(200);

    // Check title (might be dynamic, so check for inclusion)
    expect(result.title).toBeTruthy();
    expect(result.title?.toLowerCase()).toContain("corrina joseph");
    expect(result.title?.toLowerCase()).toContain("wish tonite");

    // Check content
    expect(result.content).toBeTruthy();
    expect(result.content.toLowerCase()).toContain("corrina joseph");
    expect(result.content.toLowerCase()).toContain("wish tonite / lonely");
    expect(result.content.toLowerCase()).toContain("atlantic jaxx");
    // Check for something that indicates JS has run, e.g., a class or text not in the initial shell
    // From the web search, terms like "Add to basket" or track listings are good indicators.
    expect(result.content.toLowerCase()).toContain("add to basket");
    expect(result.content).toContain("A1"); // Track number
    expect(result.content).toContain("Wish Tonite (Original Mix)"); // Track name
  }, 30000); // Increased timeout for live fetch and rendering
});

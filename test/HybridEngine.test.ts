/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, type Mocked } from "vitest";
import { HybridEngine } from "../src/HybridEngine.js";
import { FetchEngine, FetchEngineHttpError } from "../src/FetchEngine.js";
import { PlaywrightEngine } from "../src/PlaywrightEngine.js";
import type { HTMLFetchResult, PlaywrightEngineConfig, BrowserMetrics } from "../src/types.js";

// Mock the engines
vi.mock("../src/FetchEngine.js");
vi.mock("../src/PlaywrightEngine.js");

const MockFetchEngine = vi.mocked(FetchEngine);
const MockPlaywrightEngine = vi.mocked(PlaywrightEngine);

describe("HybridEngine", () => {
  let hybridEngine: HybridEngine;
  let mockFetchEngineInstance: Mocked<FetchEngine>;
  let mockPlaywrightEngineInstance: Mocked<PlaywrightEngine>;

  const testUrl = "http://example.com";
  const mockFetchResultHtml: HTMLFetchResult = {
    content: "<html><title>Fetch</title><body>Fetched</body></html>",
    contentType: "html",
    title: "Fetch",
    url: testUrl,
    isFromCache: false,
    statusCode: 200,
    error: undefined,
  };
  const mockFetchResultMd: HTMLFetchResult = {
    content: "# Fetch Title",
    contentType: "markdown",
    title: "Fetch",
    url: testUrl,
    isFromCache: false,
    statusCode: 200,
    error: undefined,
  };
  const mockPlaywrightResultHtml: HTMLFetchResult = {
    content: "<html><title>Playwright</title><body>Rendered by Playwright</body></html>",
    contentType: "html",
    title: "Playwright",
    url: testUrl,
    isFromCache: false,
    statusCode: 200,
    error: undefined,
  };
  const mockPlaywrightResultMd: HTMLFetchResult = {
    content: "# Playwright Title",
    contentType: "markdown",
    title: "Playwright",
    url: testUrl,
    isFromCache: false,
    statusCode: 200,
    error: undefined,
  };
  const exampleMetrics: BrowserMetrics[] = [
    {
      id: "pw-1",
      activePages: 1,
      pagesCreated: 5,
      errors: 0,
      isHealthy: true,
      lastUsed: new Date(),
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create the mock instances FIRST
    mockFetchEngineInstance = {
      fetchHTML: vi.fn(),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    } as unknown as Mocked<FetchEngine>;

    mockPlaywrightEngineInstance = {
      fetchHTML: vi.fn(),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue(exampleMetrics),
    } as unknown as Mocked<PlaywrightEngine>;

    // Configure the mock constructors to return these specific instances
    MockFetchEngine.mockImplementation(() => mockFetchEngineInstance);
    MockPlaywrightEngine.mockImplementation(() => mockPlaywrightEngineInstance);

    // Instantiate the class under test - its constructor will now use our mocks
    hybridEngine = new HybridEngine();

    // Clear constructor mocks *after* HybridEngine is instantiated if needed
    // MockFetchEngine.mockClear();
    // MockPlaywrightEngine.mockClear();
  });

  it("FR4.1: should instantiate FetchEngine and PlaywrightEngine", () => {
    expect(MockFetchEngine).toHaveBeenCalledTimes(1);
    expect(MockPlaywrightEngine).toHaveBeenCalledTimes(1);
  });

  it("FR4.2: should return HTML result from FetchEngine if successful (default markdown)", async () => {
    mockFetchEngineInstance.fetchHTML.mockResolvedValue(mockFetchResultHtml);
    const result = await hybridEngine.fetchHTML(testUrl);
    expect(result).toBe(mockFetchResultHtml);
    expect(result.contentType).toBe("html");
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).not.toHaveBeenCalled();
  });

  it("should return Markdown result from FetchEngine if successful (engine configured for markdown)", async () => {
    // Re-instantiate HybridEngine with markdown: true for this test
    hybridEngine = new HybridEngine({ markdown: true });
    // Ensure the *mock* FetchEngine instance (created by the mocked constructor) returns Markdown
    mockFetchEngineInstance.fetchHTML.mockResolvedValue(mockFetchResultMd);

    const result = await hybridEngine.fetchHTML(testUrl);
    expect(result).toBe(mockFetchResultMd);
    expect(result.contentType).toBe("markdown");
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).not.toHaveBeenCalled();
  });

  it("FR4.3: should fall back to PlaywrightEngine (HTML) if FetchEngine fails (default markdown)", async () => {
    const fetchError = new FetchEngineHttpError("Fetch failed", 403);
    mockFetchEngineInstance.fetchHTML.mockRejectedValue(fetchError);
    mockPlaywrightEngineInstance.fetchHTML.mockResolvedValue(mockPlaywrightResultHtml);

    const result = await hybridEngine.fetchHTML(testUrl);
    expect(result).toBe(mockPlaywrightResultHtml);
    expect(result.contentType).toBe("html");
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl, expect.anything());
  });

  it("FR4.3: should fall back to PlaywrightEngine (Markdown) if FetchEngine fails (engine configured for markdown)", async () => {
    hybridEngine = new HybridEngine({ markdown: true });
    const fetchError = new FetchEngineHttpError("Fetch failed", 403);
    mockFetchEngineInstance.fetchHTML.mockRejectedValue(fetchError);
    // Ensure the mocked Playwright engine returns Markdown in the fallback
    mockPlaywrightEngineInstance.fetchHTML.mockResolvedValue(mockPlaywrightResultMd);

    const result = await hybridEngine.fetchHTML(testUrl);
    expect(result).toBe(mockPlaywrightResultMd);
    expect(result.contentType).toBe("markdown");
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    // Check that Playwright was called with options including markdown: true
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(
      testUrl,
      expect.objectContaining({ markdown: true })
    );
  });

  it("should use per-request markdown option ONLY on Playwright fallback", async () => {
    // Engine defaults to markdown: false
    mockFetchEngineInstance.fetchHTML.mockResolvedValue(mockFetchResultHtml);
    // Mock Playwright to return Markdown IF it gets called
    mockPlaywrightEngineInstance.fetchHTML.mockResolvedValue(mockPlaywrightResultMd);

    // Request markdown: true
    const result = await hybridEngine.fetchHTML(testUrl, { markdown: true });

    // Expect FetchEngine to be called (and succeed) returning HTML because it uses constructor config
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(result).toBe(mockFetchResultHtml);
    expect(result.contentType).toBe("html");
    // Playwright should NOT have been called
    expect(mockPlaywrightEngineInstance.fetchHTML).not.toHaveBeenCalled();
  });

  it("FR4.4: should pass configuration to PlaywrightEngine", () => {
    const config: PlaywrightEngineConfig = { maxRetries: 5, cacheTTL: 0 };
    vi.clearAllMocks();
    hybridEngine = new HybridEngine(config);

    expect(MockFetchEngine).toHaveBeenCalledTimes(1);
    expect(MockPlaywrightEngine).toHaveBeenCalledTimes(1);
    expect(MockPlaywrightEngine).toHaveBeenCalledWith(config);
  });

  it("FR4.5: cleanup should call cleanup on both engines", async () => {
    await hybridEngine.cleanup();

    expect(mockFetchEngineInstance.cleanup).toHaveBeenCalledTimes(1);
    expect(mockPlaywrightEngineInstance.cleanup).toHaveBeenCalledTimes(1);
  });

  it("getMetrics should delegate to PlaywrightEngine", () => {
    const specificMockMetrics: BrowserMetrics[] = [
      {
        id: "pw-test-specific",
        activePages: 2,
        pagesCreated: 10,
        errors: 1,
        isHealthy: false,
        lastUsed: new Date(),
        createdAt: new Date(),
      },
    ];
    // Directly modify the return value of the existing mock function for this test
    mockPlaywrightEngineInstance.getMetrics.mockReturnValue(specificMockMetrics);

    const result = hybridEngine.getMetrics();

    expect(result).toEqual(specificMockMetrics);
    expect(mockPlaywrightEngineInstance.getMetrics).toHaveBeenCalledTimes(1);
    expect(mockFetchEngineInstance.getMetrics).not.toHaveBeenCalled();
  });
});

/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, type Mocked } from "vitest";
import { HybridEngine } from "../src/HybridEngine.js";
import { FetchEngine, FetchEngineHttpError } from "../src/FetchEngine.js";
import { PlaywrightEngine } from "../src/PlaywrightEngine.js";
import type {
  HTMLFetchResult,
  PlaywrightEngineConfig,
  BrowserMetrics,
  FetchOptions,
} from "../src/types.js";

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
  const mockFetchResult: HTMLFetchResult = {
    html: "<html><title>Fetch</title><body>Fetched</body></html>",
    title: "Fetch",
    url: testUrl,
    isFromCache: false,
    statusCode: 200,
    error: undefined,
  };
  const mockPlaywrightResult: HTMLFetchResult = {
    html: "<html><title>Playwright</title><body>Rendered by Playwright</body></html>",
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

  it("FR4.2: should return result from FetchEngine if successful", async () => {
    mockFetchEngineInstance.fetchHTML.mockResolvedValue(mockFetchResult);

    const result = await hybridEngine.fetchHTML(testUrl);

    expect(result).toBe(mockFetchResult);
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).not.toHaveBeenCalled();
  });

  it("FR4.3: should fall back to PlaywrightEngine if FetchEngine fails", async () => {
    const fetchError = new FetchEngineHttpError("Fetch failed", 403);
    mockFetchEngineInstance.fetchHTML.mockRejectedValue(fetchError);
    mockPlaywrightEngineInstance.fetchHTML.mockResolvedValue(
      mockPlaywrightResult,
    );

    const result = await hybridEngine.fetchHTML(testUrl);

    expect(result).toBe(mockPlaywrightResult);
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(
      testUrl,
    );
  });

  it("FR4.3: should throw PlaywrightEngine error if both engines fail", async () => {
    const fetchError = new Error("Fetch network error");
    const playwrightError = new Error("Playwright navigation failed");
    mockFetchEngineInstance.fetchHTML.mockRejectedValue(fetchError);
    mockPlaywrightEngineInstance.fetchHTML.mockRejectedValue(playwrightError);

    await expect(hybridEngine.fetchHTML(testUrl)).rejects.toThrow(
      playwrightError,
    );

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(testUrl);
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(
      testUrl,
    );
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
    const result = hybridEngine.getMetrics();

    expect(result).toBe(exampleMetrics);
    expect(mockPlaywrightEngineInstance.getMetrics).toHaveBeenCalledTimes(1);
    expect(mockFetchEngineInstance.getMetrics).not.toHaveBeenCalled();
  });
});

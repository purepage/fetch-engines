import { PlaywrightEngine } from "../src/PlaywrightEngine";
import { PlaywrightBrowserPool } from "../src/browser/PlaywrightBrowserPool";
import { MarkdownConverter } from "../src/utils/markdown-converter.js";
import axios from "axios";
import PQueue from "p-queue";
import { vi, describe, it, expect, beforeEach, afterEach, SpyInstance } from "vitest";
import { COMMON_HEADERS as ENGINE_COMMON_HEADERS } from "../src/constants"; // Actual common headers from engine

// Mock dependencies
vi.mock("../src/browser/PlaywrightBrowserPool");
vi.mock("axios");
vi.mock("p-queue", () => {
  // Mock PQueue to execute tasks immediately for testing
  return {
    default: vi.fn().mockImplementation(() => ({
      add: vi.fn((task: () => Promise<any>) => task()), // Immediately execute the task
      onIdle: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
      size: 0,
      pending: 0,
    })),
  };
});
vi.mock("../src/utils/markdown-converter.js");


describe("PlaywrightEngine - Headers", () => {
  const MOCK_URL = "http://example.com";
  let mockPage: any;
  let mockPoolInstance: any;
  let engine: PlaywrightEngine;

  const DEFAULT_ENGINE_CONFIG_BASE = {
    concurrentPages: 1,
    maxRetries: 0, // Set to 0 for fallback tests to avoid complex retry logic unless testing retries
    retryDelay: 10, // ms
    cacheTTL: 0, // disable cache for most tests
    useHttpFallback: false,
    useHeadedModeFallback: false,
    defaultFastMode: true,
    simulateHumanBehavior: false, // Disable for most tests to simplify
    maxBrowsers: 1,
    maxPagesPerContext: 1,
    maxBrowserAge: 0, 
    healthCheckInterval: 0, 
    poolBlockedDomains: [],
    poolBlockedResourceTypes: [],
    proxy: undefined,
    useHeadedMode: false,
    markdown: false, 
    spaMode: false,
    spaRenderDelayMs: 0,
    playwrightOnlyPatterns: [],
    playwrightLaunchOptions: undefined,
    headers: {}, // Default empty headers
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPage = {
      setExtraHTTPHeaders: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue({
        ok: () => true,
        status: () => 200,
        url: () => MOCK_URL,
        text: async () => "<html><head><title>Test Title</title></head><body>Playwright Content</body></html>",
        headers: () => ({ "content-type": "text/html" }),
      }),
      title: vi.fn().mockResolvedValue("Test Title"),
      content: vi.fn().mockResolvedValue("<html><body>Playwright Content</body></html>"),
      url: vi.fn().mockReturnValue(MOCK_URL), // Added this line
      close: vi.fn().mockResolvedValue(undefined),
      context: vi.fn(() => ({
        browser: vi.fn(() => ({
            isConnected: vi.fn(() => true),
            close: vi.fn().mockResolvedValue(undefined) 
        })),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      setDefaultNavigationTimeout: vi.fn(),
      setDefaultTimeout: vi.fn(),
      evaluate: vi.fn(),
      $: vi.fn(),
      $$: vi.fn(),
      waitForLoadState: vi.fn(),
      waitForTimeout: vi.fn(),
      route: vi.fn().mockResolvedValue(undefined), 
      mouse: { move: vi.fn(), wheel: vi.fn() }, 
      keyboard: { press: vi.fn() },          
      viewportSize: vi.fn(() => ({ width: 1920, height: 1080 })), 
    };

    mockPoolInstance = {
      acquirePage: vi.fn().mockResolvedValue(mockPage),
      releasePage: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
      initialize: vi.fn().mockResolvedValue(undefined), 
    };
    (PlaywrightBrowserPool as any as SpyInstance).mockImplementation(() => mockPoolInstance);

    (axios.get as SpyInstance).mockResolvedValue({
      data: "<html><body>Axios Fallback Content</body></html>",
      status: 200,
      headers: { "content-type": "text/html" },
      request: { res: { responseUrl: MOCK_URL } }, 
    });

    (MarkdownConverter.prototype.convert as SpyInstance).mockImplementation((html) => `markdown: ${html}`);
  });

  afterEach(async () => {
    if (engine) {
      // await engine.cleanup(); // Ensure cleanup is called if engine was initialized
    }
  });


  describe("Playwright Page Navigation Headers (page.setExtraHTTPHeaders)", () => {
    it("should call page.setExtraHTTPHeaders with constructor headers", async () => {
      const constructorHeaders = { "X-Construct": "val-c" };
      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: constructorHeaders });
      await engine.fetchHTML(MOCK_URL);
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(constructorHeaders);
    });

    it("should call page.setExtraHTTPHeaders with fetchHTML option headers if no constructor headers", async () => {
      const fetchOptionsHeaders = { "X-Fetch": "val-f" };
      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: {} });
      await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(fetchOptionsHeaders);
    });

    it("should call page.setExtraHTTPHeaders with merged headers (fetchHTML options override constructor)", async () => {
      const constructorHeaders = { "X-Construct": "val-c", "X-Common": "construct" };
      const fetchOptionsHeaders = { "X-Fetch": "val-f", "X-Common": "fetch" };
      const expectedHeaders = { ...constructorHeaders, ...fetchOptionsHeaders }; 

      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: constructorHeaders });
      await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(expectedHeaders);
    });

    it("should NOT call page.setExtraHTTPHeaders if no effective headers are present (both constructor and options are empty or undefined)", async () => {
      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: {} });
      await engine.fetchHTML(MOCK_URL, { headers: {} }); 
      expect(mockPage.setExtraHTTPHeaders).not.toHaveBeenCalled();

      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE }); // headers undefined in config
      await engine.fetchHTML(MOCK_URL, {}); // headers undefined in options
      expect(mockPage.setExtraHTTPHeaders).not.toHaveBeenCalled();
    });

     it("should call page.setExtraHTTPHeaders if constructor has headers and options is empty obj", async () => {
      const constructorHeaders = { "X-Initial": "foo" };
      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: constructorHeaders });
      await engine.fetchHTML(MOCK_URL, { headers: {} }); // Empty options headers
      // Effective headers should be constructorHeaders
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(constructorHeaders);
    });

    it("should call page.setExtraHTTPHeaders if options has headers and constructor is empty obj", async () => {
      const optionsHeaders = { "X-Request": "bar" };
      engine = new PlaywrightEngine({ ...DEFAULT_ENGINE_CONFIG_BASE, headers: {} }); // Empty constructor headers
      await engine.fetchHTML(MOCK_URL, { headers: optionsHeaders });
      // Effective headers should be optionsHeaders
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(optionsHeaders);
    });
  });

  describe("HTTP Fallback Headers (axios.get)", () => {
    // Helper to trigger fallback: Make Playwright page.goto fail
    const setupForFallback = () => {
      // This will cause the catch block in _fetchRecursive to be hit.
      // If useHttpFallback is true and it's the first attempt (retryAttempt === 0 and not SPA mode),
      // then _attemptHttpFallback will be called.
      // Changed to mockRejectedValue to make all goto calls fail for these tests.
      mockPage.goto.mockRejectedValue(new Error("Simulated: page.goto failure"));
    };
    
    it("should use merged custom headers (options over constructor) combined with ENGINE_COMMON_HEADERS for HTTP fallback", async () => {
      setupForFallback();
      const constructorHeaders = { "X-FB-Construct": "fb-c", "X-Common-Custom": "construct" };
      const fetchOptionsHeaders = { "X-FB-Fetch": "fb-f", "X-Common-Custom": "fetch" };
      const effectiveCustomHeaders = { ...constructorHeaders, ...fetchOptionsHeaders };
      const expectedAxiosHeaders = { ...ENGINE_COMMON_HEADERS, ...effectiveCustomHeaders };

      engine = new PlaywrightEngine({ 
        ...DEFAULT_ENGINE_CONFIG_BASE, 
        useHttpFallback: true, 
        headers: constructorHeaders,
        maxRetries: 0 // Ensure it doesn't retry Playwright before fallback
      });
      
      await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

      expect(axios.get).toHaveBeenCalledWith(
        MOCK_URL,
        expect.objectContaining({ headers: expectedAxiosHeaders })
      );
    });

    it("should use only constructor headers combined with ENGINE_COMMON_HEADERS for fallback if no fetchHTML options headers", async () => {
      setupForFallback();
      const constructorHeaders = { "X-FB-Construct-Only": "val" };
      const expectedAxiosHeaders = { ...ENGINE_COMMON_HEADERS, ...constructorHeaders };

      engine = new PlaywrightEngine({ 
        ...DEFAULT_ENGINE_CONFIG_BASE, 
        useHttpFallback: true, 
        headers: constructorHeaders,
        maxRetries: 0
      });
      await engine.fetchHTML(MOCK_URL, { headers: {} }); 
      
      expect(axios.get).toHaveBeenCalledWith(
        MOCK_URL,
        expect.objectContaining({ headers: expectedAxiosHeaders })
      );
    });
    
    it("should use only fetchHTML options headers combined with ENGINE_COMMON_HEADERS for fallback if no constructor headers", async () => {
      setupForFallback();
      const fetchOptionsHeaders = { "X-FB-Fetch-Only": "val" };
      const expectedAxiosHeaders = { ...ENGINE_COMMON_HEADERS, ...fetchOptionsHeaders };

      engine = new PlaywrightEngine({ 
        ...DEFAULT_ENGINE_CONFIG_BASE, 
        useHttpFallback: true, 
        headers: {}, // Empty constructor headers
        maxRetries: 0
      });
      await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

      expect(axios.get).toHaveBeenCalledWith(
        MOCK_URL,
        expect.objectContaining({ headers: expectedAxiosHeaders })
      );
    });

    it("should use only ENGINE_COMMON_HEADERS for fallback if no custom headers are provided at any level", async () => {
      setupForFallback();
      engine = new PlaywrightEngine({ 
        ...DEFAULT_ENGINE_CONFIG_BASE, 
        useHttpFallback: true, 
        headers: {}, // Empty constructor
        maxRetries: 0
      });
      await engine.fetchHTML(MOCK_URL, { headers: {} }); // Empty options

      expect(axios.get).toHaveBeenCalledWith(
        MOCK_URL,
        expect.objectContaining({ headers: ENGINE_COMMON_HEADERS }) 
      );
    });

    it("should allow custom headers to override ENGINE_COMMON_HEADERS keys in fallback", async () => {
      setupForFallback();
      // Example: User-Agent is typically in ENGINE_COMMON_HEADERS
      const customHeaders = { "User-Agent": "MyCustomFallbackAgent/1.0", "X-Unique": "UniqueValue" };
      const expectedAxiosHeaders = { ...ENGINE_COMMON_HEADERS, ...customHeaders };
      
      engine = new PlaywrightEngine({ 
        ...DEFAULT_ENGINE_CONFIG_BASE, 
        useHttpFallback: true, 
        headers: customHeaders,
        maxRetries: 0
      });
      await engine.fetchHTML(MOCK_URL, { headers: {} });

      expect(axios.get).toHaveBeenCalledWith(
        MOCK_URL,
        expect.objectContaining({ headers: expectedAxiosHeaders })
      );
    });

    it("should not attempt HTTP fallback if useHttpFallback is false, even if Playwright fails", async () => {
        setupForFallback(); // page.goto will fail
        engine = new PlaywrightEngine({
            ...DEFAULT_ENGINE_CONFIG_BASE,
            useHttpFallback: false, // Explicitly false
            maxRetries: 0
        });

        // We expect fetchHTML to throw because Playwright fails and fallback is disabled
        await expect(engine.fetchHTML(MOCK_URL, {})).rejects.toThrow();
        expect(axios.get).not.toHaveBeenCalled();
    });
  });
});

import { HybridEngine } from "../src/HybridEngine";
import { FetchEngine } from "../src/FetchEngine";
import { PlaywrightEngine } from "../src/PlaywrightEngine";
import { FetchError } from "../src/errors";
import { vi, describe, it, expect, beforeEach, SpyInstance } from "vitest";

// Mock the engines
vi.mock("../src/FetchEngine");
vi.mock("../src/PlaywrightEngine");

describe("HybridEngine - Headers Propagation", () => {
  const MOCK_URL = "http://example.com";
  let mockFetchEngineInstance: any;
  let mockPlaywrightEngineInstance: any;

  beforeEach(() => {
    vi.clearAllMocks(); 

    mockFetchEngineInstance = {
      fetchHTML: vi
        .fn()
        .mockResolvedValue({
          content: "fetch-html",
          title: "Test",
          contentType: "html",
          url: MOCK_URL,
          isFromCache: false,
          statusCode: 200,
          error: undefined,
        }),
      fetchContent: vi
        .fn()
        .mockResolvedValue({
          content: "fetch-content",
          title: "Test",
          contentType: "text/plain",
          url: MOCK_URL,
          isFromCache: false,
          statusCode: 200,
          error: undefined,
        }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
    mockPlaywrightEngineInstance = {
      fetchHTML: vi
        .fn()
        .mockResolvedValue({
          content: "playwright-html",
          title: "Test",
          contentType: "html",
          url: MOCK_URL,
          isFromCache: false,
          statusCode: 200,
          error: undefined,
        }),
      fetchContent: vi
        .fn()
        .mockResolvedValue({
          content: "playwright-content",
          title: "Test",
          contentType: "text/plain",
          url: MOCK_URL,
          isFromCache: false,
          statusCode: 200,
          error: undefined,
        }),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    };

    (FetchEngine as any as SpyInstance).mockImplementation(() => mockFetchEngineInstance);
    (PlaywrightEngine as any as SpyInstance).mockImplementation(() => mockPlaywrightEngineInstance);
  });

  // --- FetchEngine Propagation Tests ---

  it("should pass HybridEngine constructor headers to FetchEngine constructor", () => {
    const hybridConstructorHeaders = { "X-Hybrid-Construct": "val1" };
    new HybridEngine({ headers: hybridConstructorHeaders });

    expect(FetchEngine).toHaveBeenCalledWith(
      expect.objectContaining({ headers: hybridConstructorHeaders })
    );
  });

  it("should pass HybridEngine fetchHTML options headers to FetchEngine.fetchHTML call", async () => {
    const engine = new HybridEngine(); // No constructor headers for HybridEngine
    const hybridFetchHtmlOptionsHeaders = { "X-Hybrid-Fetch": "val2" };
    await engine.fetchHTML(MOCK_URL, { headers: hybridFetchHtmlOptionsHeaders });

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(
      MOCK_URL,
      // FetchEngine.fetchHTML options should contain the headers passed to HybridEngine.fetchHTML
      expect.objectContaining({ headers: hybridFetchHtmlOptionsHeaders }) 
    );
  });

  it("FetchEngine should correctly prioritize headers from HybridEngine's fetchHTML options over HybridEngine's constructor options", async () => {
    const constructorHeaders = { "X-Common": "construct", "X-Construct-Only": "c-val" };
    const fetchHtmlHeaders = { "X-Common": "fetch", "X-Fetch-Only": "f-val" };

    const engine = new HybridEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchHtmlHeaders });
    
    // Assert FetchEngine constructor was called with Hybrid's constructor headers
    expect(FetchEngine).toHaveBeenCalledWith(
      expect.objectContaining({ headers: constructorHeaders })
    );
    // Assert FetchEngine.fetchHTML was called with Hybrid's fetchHTML headers
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: fetchHtmlHeaders })
    );
    // FetchEngine itself will handle the final merge of these two sets with base defaults.
  });

  it("should pass undefined to FetchEngine constructor if no headers in HybridEngine constructor", () => {
    new HybridEngine({}); // No headers in constructor
    
     const fetchEngineArgs = (FetchEngine as any as SpyInstance).mock.calls[0][0];
     // HybridEngine passes { markdown: config.markdown, headers: config.headers } to FetchEngine constructor.
     // If config.headers is undefined, then fetchEngineArgs.headers will be undefined.
     expect(fetchEngineArgs.headers).toBeUndefined();
  });

  it("should pass undefined to FetchEngine.fetchHTML if no headers in HybridEngine.fetchHTML options", async () => {
    const engine = new HybridEngine();
    await engine.fetchHTML(MOCK_URL, {}); // No headers in options

    // HybridEngine's fetchHTML prepares fetchEngineCallSpecificOptions.
    // options.headers would be undefined, so fetchEngineCallSpecificOptions.headers will be undefined.
    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: undefined }) 
    );
  });

  // --- PlaywrightEngine Propagation Tests ---

  it("should pass merged headers (options over constructor) to PlaywrightEngine on playwrightOnlyPattern match", async () => {
    const hybridConstructorHeaders = { "X-PW-Construct": "pw-c", "X-Common": "construct" };
    const hybridFetchHtmlOptionsHeaders = { "X-PW-Fetch": "pw-f", "X-Common": "fetch" };
    // HybridEngine merges these before passing to PlaywrightEngine
    const expectedMergedHeadersForPlaywright = { ...hybridConstructorHeaders, ...hybridFetchHtmlOptionsHeaders };

    const engine = new HybridEngine({ 
      headers: hybridConstructorHeaders,
      playwrightOnlyPatterns: [MOCK_URL] // Trigger PlaywrightEngine directly
    });
    await engine.fetchHTML(MOCK_URL, { headers: hybridFetchHtmlOptionsHeaders });

    // PlaywrightEngine.fetchHTML is called with PlaywrightEngineConfig (this.config in Hybrid)
    // merged with per-request options (options in Hybrid.fetchHTML).
    // The 'playwrightOptions' object in HybridEngine is constructed as:
    // { ...this.config, ...options, markdown: effectiveMarkdown, spaMode: effectiveSpaMode }
    // So, headers from 'options' (hybridFetchHtmlOptionsHeaders) override headers from 'this.config' (hybridConstructorHeaders).
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsPatternMatch = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsPatternMatch.headers).toEqual(expectedMergedHeadersForPlaywright);
    expect(mockFetchEngineInstance.fetchHTML).not.toHaveBeenCalled();
  });

  it("should pass merged headers (options over constructor) to PlaywrightEngine on FetchEngine failure", async () => {
    const hybridConstructorHeaders = { "X-PW-Fail-C": "val-c", "X-Common": "construct-fail" };
    const hybridFetchHtmlOptionsHeaders = { "X-PW-Fail-F": "val-f", "X-Common": "fetch-fail" };
    const expectedMergedHeadersForPlaywright = { ...hybridConstructorHeaders, ...hybridFetchHtmlOptionsHeaders };
    
    mockFetchEngineInstance.fetchHTML.mockRejectedValueOnce(new Error("Fetch engine deliberately failed"));

    const engine = new HybridEngine({ headers: hybridConstructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: hybridFetchHtmlOptionsHeaders });

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledTimes(1); 
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsFailure = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsFailure.headers).toEqual(expectedMergedHeadersForPlaywright);
  });

  it("should pass only constructor headers to PlaywrightEngine if no fetchHTML options headers (pattern match)", async () => {
    const hybridConstructorHeaders = { "X-PW-Construct-Only": "pw-c-only" };
    const engine = new HybridEngine({ 
      headers: hybridConstructorHeaders,
      playwrightOnlyPatterns: [MOCK_URL]
    });
    await engine.fetchHTML(MOCK_URL, {}); // No headers in fetchHTML options

    // playwrightOptions will be { ...this.config (with headers), ...options (no headers) }
    // So, headers from this.config (hybridConstructorHeaders) should be used.
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsConstructOnly = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsConstructOnly.headers).toEqual(hybridConstructorHeaders);
  });
  
  it("should pass only fetchHTML options headers to PlaywrightEngine if no constructor headers (pattern match)", async () => {
    const hybridFetchHtmlOptionsHeaders = { "X-PW-Fetch-Only": "pw-f-only" };
    const engine = new HybridEngine({ 
      playwrightOnlyPatterns: [MOCK_URL] // No constructor headers
    });
    await engine.fetchHTML(MOCK_URL, { headers: hybridFetchHtmlOptionsHeaders });

    // playwrightOptions will be { ...this.config (no headers), ...options (with headers) }
    // So, headers from options (hybridFetchHtmlOptionsHeaders) should be used.
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsFetchOnly = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsFetchOnly.headers).toEqual(hybridFetchHtmlOptionsHeaders);
  });

  it("should pass undefined headers to PlaywrightEngine if no headers anywhere (pattern match)", async () => {
    const engine = new HybridEngine({ 
      playwrightOnlyPatterns: [MOCK_URL] // No constructor headers
    });
    await engine.fetchHTML(MOCK_URL, {}); // No fetchHTML options headers

    // playwrightOptions will be { ...this.config (no headers), ...options (no headers) }
    // So, playwrightOptions.headers will be {}.
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsUndefinedPattern = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsUndefinedPattern.headers).toEqual({});
  });

  it("should pass undefined headers to PlaywrightEngine if no headers anywhere (FetchEngine failure)", async () => {
    mockFetchEngineInstance.fetchHTML.mockRejectedValueOnce(new Error("Fetch engine failed again"));
    const engine = new HybridEngine({}); // No constructor headers
    await engine.fetchHTML(MOCK_URL, {}); // No fetchHTML options headers

    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
    const actualOptionsUndefinedFailure = mockPlaywrightEngineInstance.fetchHTML.mock.calls[mockPlaywrightEngineInstance.fetchHTML.mock.calls.length - 1][1];
    expect(actualOptionsUndefinedFailure.headers).toEqual({});
  });

  it("should auto-render a shell-like HTTP response even when spaMode is not enabled", async () => {
    mockFetchEngineInstance.fetchHTML.mockResolvedValueOnce({
      content: '<html><head><title></title></head><body><div id="app"></div><script src="/app.js"></script><script src="/vendor.js"></script><script src="/runtime.js"></script></body></html>',
      title: "",
      contentType: "html",
      url: MOCK_URL,
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    });

    const engine = new HybridEngine();
    await engine.fetchHTML(MOCK_URL, {});

    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
  });

  it("should retry a transient FetchEngine HTML failure before falling back to Playwright", async () => {
    mockFetchEngineInstance.fetchHTML
      .mockRejectedValueOnce(new FetchError("fetch failed", "ERR_FETCH_FAILED"))
      .mockResolvedValueOnce({
        content: `<!DOCTYPE html>
          <html>
            <head><title>Recovered</title></head>
            <body>
              <main>
                <h1>Recovered content</h1>
                <p>This page contains enough descriptive body copy to avoid render escalation.</p>
                <p>HybridEngine should keep the second HTTP response instead of treating it like an app shell.</p>
              </main>
            </body>
          </html>`,
        title: "Recovered",
        contentType: "html",
        url: MOCK_URL,
        isFromCache: false,
        statusCode: 200,
        error: undefined,
      });

    const engine = new HybridEngine();
    const result = await engine.fetchHTML(MOCK_URL, {});

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledTimes(2);
    expect(mockPlaywrightEngineInstance.fetchHTML).not.toHaveBeenCalled();
    expect(result.title).toBe("Recovered");
  });

  it("should not retry a timed out FetchEngine HTML request before falling back to Playwright", async () => {
    mockFetchEngineInstance.fetchHTML.mockRejectedValueOnce(new FetchError("Fetch timed out after 10000ms", "ERR_FETCH_TIMEOUT"));

    const engine = new HybridEngine();
    const result = await engine.fetchHTML(MOCK_URL, {});

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledTimes(1);
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledTimes(1);
    expect(result.content).toBe("playwright-html");
  });

  it("should retry a transient FetchEngine content failure before falling back to Playwright", async () => {
    mockFetchEngineInstance.fetchContent
      .mockRejectedValueOnce(new FetchError("content failed", "ERR_FETCH_FAILED"))
      .mockResolvedValueOnce({
        content: "Recovered content",
        contentType: "text/plain",
        title: null,
        url: MOCK_URL,
        isFromCache: false,
        statusCode: 200,
        error: undefined,
      });

    const engine = new HybridEngine();
    const result = await engine.fetchContent(MOCK_URL, {});

    expect(mockFetchEngineInstance.fetchContent).toHaveBeenCalledTimes(2);
    expect(mockPlaywrightEngineInstance.fetchContent).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(200);
  });

  it("should detect shells before markdown conversion", async () => {
    mockFetchEngineInstance.fetchHTML.mockResolvedValueOnce({
      content: '<html><head><title></title></head><body><div id="app"></div><script src="/app.js"></script><script src="/vendor.js"></script><script src="/runtime.js"></script></body></html>',
      title: "",
      contentType: "html",
      url: MOCK_URL,
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    });

    const engine = new HybridEngine({ markdown: true });
    await engine.fetchHTML(MOCK_URL, { markdown: true });

    expect(mockFetchEngineInstance.fetchHTML).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ markdown: false })
    );
    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(MOCK_URL, expect.any(Object));
  });

  it("should fall back to the HTTP result when Playwright render fails after a successful fetch", async () => {
    const httpShellResult = {
      content: '<html><head><title></title></head><body><div id="app"></div><script src="/app.js"></script><script src="/vendor.js"></script><script src="/runtime.js"></script></body></html>',
      title: "",
      contentType: "html" as const,
      url: MOCK_URL,
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    };

    mockFetchEngineInstance.fetchHTML.mockResolvedValueOnce(httpShellResult);
    mockPlaywrightEngineInstance.fetchHTML.mockRejectedValueOnce(new Error("render failed"));

    const engine = new HybridEngine();
    const result = await engine.fetchHTML(MOCK_URL, {});

    expect(result).toEqual(httpShellResult);
  });

  it("should escalate a soft-block page to Playwright even when it has a title and text", async () => {
    const softBlockHtml = `<!DOCTYPE html>
      <html><head><title>Just a moment...</title></head>
      <body>
        <div class="cf-challenge">
          <h2>Checking your browser before accessing the site.</h2>
          <p>This process is automatic.</p>
        </div>
      </body></html>`;

    mockFetchEngineInstance.fetchHTML.mockResolvedValueOnce({
      content: softBlockHtml,
      title: "Just a moment...",
      contentType: "html",
      url: MOCK_URL,
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    });

    const engine = new HybridEngine();
    await engine.fetchHTML(MOCK_URL, {});

    expect(mockPlaywrightEngineInstance.fetchHTML).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ useHttpFallback: false, spaMode: true })
    );
  });
});

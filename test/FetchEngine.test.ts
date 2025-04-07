import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchEngine, FetchEngineHttpError } from "../src/FetchEngine.js"; // Adjust path as needed
import { FetchError } from "../src/errors.js"; // Import directly from errors.js

// Mock the global fetch
const mockFetch = vi.fn();
// Use a more specific type assertion than 'any'
global.fetch = mockFetch as unknown as typeof fetch;

describe("FetchEngine", () => {
  let engine: FetchEngine;

  beforeEach(() => {
    engine = new FetchEngine();
    mockFetch.mockClear(); // Reset mocks before each test
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore original fetch after each test run
  });

  it("FR1.1/FR2.1: should fetch HTML content successfully", async () => {
    const mockHtml = "<html><head><title>Test Title</title></head><body>Content</body></html>";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(mockHtml),
      url: "http://example.com",
    });

    const result = await engine.fetchHTML("http://example.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("http://example.com", expect.any(Object));
    expect(result.content).toBe(mockHtml); // Use content
    expect(result.contentType).toBe("html"); // Should be html by default
    expect(result.statusCode).toBe(200);
    expect(result.isFromCache).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.url).toBe("http://example.com");
    // Test title extraction
    expect(result.title).toBe("Test Title");
  });

  it("FR1.3: should extract the title correctly", async () => {
    const testUrl = "http://example.com/titled";
    const mockHtml = '<html><head><meta charset="utf-8"><title>Test Title</title></head><body>Content</body></html>';
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: testUrl,
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result = await engine.fetchHTML(testUrl);

    expect(result.title).toBe("Test Title");
  });

  it("FR1.3: should return empty title if title tag is missing or empty", async () => {
    const testUrl = "http://example.com/no-title";
    const mockHtml = "<html><head></head><body>No title here</body></html>";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(mockHtml),
      url: testUrl,
    });

    const result = await engine.fetchHTML(testUrl);
    expect(result.title).toBeNull(); // Should be null now
  });

  it("FR5.1: should throw FetchEngineHttpError for non-ok HTTP status codes", async () => {
    const testUrl = "http://example.com/notfound";
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve("<html>Not Found</html>"),
      url: testUrl,
    });

    try {
      await engine.fetchHTML(testUrl);
      // If fetchHTML doesn't throw, fail the test
      expect.fail("Expected fetchHTML to throw FetchEngineHttpError");
    } catch (error: any) {
      expect(error).toBeInstanceOf(FetchEngineHttpError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("HTTP error! status: 404");
      expect(error.code).toBe("ERR_HTTP_ERROR");
    }
  });

  it("FR5.1: should throw FetchError for non-HTML content types", async () => {
    const testUrl = "http://example.com/json";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{ "data": "test" }'),
      url: testUrl,
    });

    try {
      await engine.fetchHTML(testUrl);
      expect.fail("Expected fetchHTML to throw FetchError with code ERR_NON_HTML_CONTENT");
    } catch (error: any) {
      expect(error).toBeInstanceOf(FetchError);
      expect(error.code).toBe("ERR_NON_HTML_CONTENT");
      expect(error.message).toBe("Content-Type is not text/html");
    }
  });

  it("FR2.3: should follow redirects and return the final URL", async () => {
    const finalUrl = "http://example.com/final-destination";
    const mockHtml = "<html><title>Redirected</title><body>Landed</body></html>";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(mockHtml),
      url: finalUrl, // Mock fetch resolves with the FINAL URL
    });

    const result = await engine.fetchHTML("http://example.com/initial-redirect");

    expect(mockFetch).toHaveBeenCalledWith("http://example.com/initial-redirect", expect.any(Object));
    expect(result.url).toBe(finalUrl);
    expect(result.content).toBe(mockHtml); // Check content on result
    expect(result.title).toBe("Redirected");
  });

  it("should fetch and convert HTML to Markdown when markdown option is true", async () => {
    const testUrl = "http://example.com/markdown-test";
    const mockHtml = `
      <html>
        <head><title>Markdown Test</title></head>
        <body>
          <h1>Main Heading</h1>
          <p>This is a paragraph.</p>
          <ul><li>Item 1</li><li>Item 2</li></ul>
        </body>
      </html>`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(mockHtml),
      url: testUrl,
    });

    // Instantiate engine specifically for markdown
    const markdownEngine = new FetchEngine({ markdown: true });
    const result = await markdownEngine.fetchHTML(testUrl);

    // Assertions for Markdown output
    expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.any(Object));
    expect(result.contentType).toBe("markdown");
    expect(result.content).toContain("# Markdown Test");
    expect(result.content).toContain("# Main Heading");
    expect(result.content).toContain("This is a paragraph.");
    expect(result.content).toContain("- Item 1");
    expect(result.content).toContain("- Item 2");
    expect(result.content).not.toContain("<p>");
    expect(result.content).not.toContain("<li>");

    // Check other result properties
    expect(result.url).toBe(testUrl);
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe("Markdown Test"); // Title still extracted
    expect(result.error).toBeUndefined();
    expect(result.isFromCache).toBe(false);
  });

  it("should fetch HTML when markdown option is false (default)", async () => {
    const testUrl = "http://example.com/html-test";
    const mockHtml = "<html><head><title>HTML Test</title></head><body><p>HTML Content</p></body></html>";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: () => Promise.resolve(mockHtml),
      url: testUrl,
    });

    // Use the default engine instance from beforeEach
    const result = await engine.fetchHTML(testUrl);

    expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.any(Object));
    expect(result.contentType).toBe("html");
    expect(result.content).toBe(mockHtml);
    expect(result.title).toBe("HTML Test");
    expect(result.url).toBe(testUrl);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.isFromCache).toBe(false);
  });

  it("should return empty metrics array", () => {
    expect(engine.getMetrics()).toEqual([]);
  });

  it("cleanup should be a no-op and resolve", async () => {
    await expect(engine.cleanup()).resolves.toBeUndefined();
  });
});

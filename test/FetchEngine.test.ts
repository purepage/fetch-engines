import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchEngine, FetchEngineHttpError } from "../src/FetchEngine.js"; // Adjust path as needed
import type { HTMLFetchResult } from "../src/types.js";

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
    const testUrl = "http://example.com/success";
    const mockHtml = "<html><head><title>Success Page</title></head><body>Hello</body></html>";
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: testUrl, // Simulate final URL after potential redirects
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result: HTMLFetchResult = await engine.fetchHTML(testUrl);

    expect(mockFetch).toHaveBeenCalledWith(testUrl, {
      headers: expect.any(Object), // Check that headers were sent
      redirect: "follow",
    });
    expect(result.html).toBe(mockHtml);
    expect(result.url).toBe(testUrl);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(result.isFromCache).toBe(false);
    expect(result.title).toBe("Success Page");
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
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: testUrl,
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result = await engine.fetchHTML(testUrl);

    expect(result.title).toBe("");
  });

  it("FR5.1: should throw FetchEngineHttpError for non-ok HTTP status codes", async () => {
    const testUrl = "http://example.com/notfound";
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers({ "Content-Type": "text/plain" }),
      url: testUrl,
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    await expect(engine.fetchHTML(testUrl)).rejects.toThrow(FetchEngineHttpError);
    await expect(engine.fetchHTML(testUrl)).rejects.toThrow("HTTP error! status: 404");

    try {
      await engine.fetchHTML(testUrl);
    } catch (error) {
      expect(error).toBeInstanceOf(FetchEngineHttpError);
      expect((error as FetchEngineHttpError).statusCode).toBe(404);
    }
  });

  it("FR5.1: should throw Error for non-HTML content types", async () => {
    const testUrl = "http://example.com/json";
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: vi.fn().mockResolvedValue('{ "data": "test" }'),
      url: testUrl,
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    await expect(engine.fetchHTML(testUrl)).rejects.toThrow(Error);
    await expect(engine.fetchHTML(testUrl)).rejects.toThrow("Not an HTML page");
  });

  it("FR2.3: should follow redirects (handled by fetch)", async () => {
    // We rely on the `fetch` implementation's redirect: 'follow'
    // This test mainly ensures we pass the correct option and use the final URL
    const initialUrl = "http://example.com/redirect";
    const finalUrl = "http://example.com/final-destination";
    const mockHtml = "<html><head><title>Final</title></head><body>Landed</body></html>";

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: finalUrl, // The final URL after redirection
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result = await engine.fetchHTML(initialUrl);

    expect(mockFetch).toHaveBeenCalledWith(initialUrl, expect.objectContaining({ redirect: "follow" }));
    expect(result.url).toBe(finalUrl); // Check that the result uses the final URL
    expect(result.title).toBe("Final");
    expect(result.html).toBe(mockHtml);
  });

  it("should fetch and convert HTML to Markdown when markdown option is true", async () => {
    // Instantiate engine specifically with markdown: true
    const engine = new FetchEngine({ markdown: true });
    const testUrl = "http://example.com/markdown-test";
    // More structured HTML for better Markdown conversion test
    const mockHtml =
      "<html><head><title>Markdown Test</title></head><body><h1>Main Heading</h1><p>This is a paragraph.</p><ul><li>Item 1</li><li>Item 2</li></ul></body></html>";
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: testUrl,
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result: HTMLFetchResult = await engine.fetchHTML(testUrl);

    // Assertions for Markdown output
    expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.any(Object)); // Ensure fetch was called
    expect(result.html).toContain("# Markdown Test"); // Check for H1 from title (with --- separator)
    expect(result.html).toContain("# Main Heading"); // Check for H1 -> #
    // Use string containing check for potentially variable whitespace/newlines
    expect(result.html).toContain("This is a paragraph.");
    expect(result.html).toContain("- Item 1");
    expect(result.html).toContain("- Item 2");
    // Check that original HTML structure is gone
    expect(result.html).not.toContain("<p>");
    expect(result.html).not.toContain("<li>");

    // Check other result properties
    expect(result.url).toBe(testUrl);
    expect(result.statusCode).toBe(200);
    expect(result.title).toBe("Markdown Test"); // Title is still extracted before conversion
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

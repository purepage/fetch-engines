import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchEngine, FetchEngineHttpError } from "../src/FetchEngine.js"; // Adjust path as needed
import type { HTMLFetchResult } from "../src/types.js";

// Mock the global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any; // Cast to any to satisfy the type checker for tests

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
    const mockHtml =
      "<html><head><title>Success Page</title></head><body>Hello</body></html>";
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
  });

  it("FR1.3: should extract the title correctly", async () => {
    const testUrl = "http://example.com/titled";
    const mockHtml =
      '<html><head><meta charset="utf-8"><title>Test Title</title></head><body>Content</body></html>';
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

    await expect(engine.fetchHTML(testUrl)).rejects.toThrow(
      FetchEngineHttpError,
    );
    await expect(engine.fetchHTML(testUrl)).rejects.toThrow(
      "HTTP error! status: 404",
    );

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
    const mockHtml =
      "<html><head><title>Final</title></head><body>Landed</body></html>";

    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: vi.fn().mockResolvedValue(mockHtml),
      url: finalUrl, // The final URL after redirection
    };
    mockFetch.mockResolvedValue(mockResponse as unknown as Response);

    const result = await engine.fetchHTML(initialUrl);

    expect(mockFetch).toHaveBeenCalledWith(
      initialUrl,
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(result.url).toBe(finalUrl); // Check that the result uses the final URL
    expect(result.title).toBe("Final");
    expect(result.html).toBe(mockHtml);
  });

  it("should return empty metrics array", () => {
    expect(engine.getMetrics()).toEqual([]);
  });

  it("cleanup should be a no-op and resolve", async () => {
    await expect(engine.cleanup()).resolves.toBeUndefined();
  });
});

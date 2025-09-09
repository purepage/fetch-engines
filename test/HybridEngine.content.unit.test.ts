import { HybridEngine } from "../src/HybridEngine";
import { FetchEngine } from "../src/FetchEngine";
import { vi, describe, it, expect, beforeEach, SpyInstance } from "vitest";

// Mock PlaywrightEngine to avoid launching browsers
vi.mock("../src/PlaywrightEngine", () => {
  return {
    PlaywrightEngine: vi.fn().mockImplementation(() => ({
      fetchContent: vi.fn().mockResolvedValue({
        content: "PW",
        contentType: "text/html",
        title: "PW",
        url: "http://pw",
        isFromCache: false,
        statusCode: 200,
        error: undefined,
      }),
      cleanup: vi.fn().mockResolvedValue(undefined),
      getMetrics: vi.fn().mockReturnValue([]),
    })),
  };
});

// Use real FetchEngine (but we will mock global.fetch to control behavior)
const mockFetch = vi.fn();
// @ts-ignore
global.fetch = mockFetch;

describe("HybridEngine.fetchContent - unit (no network)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  it("does not fall back to Playwright on 404 from FetchEngine", async () => {
    const url = "https://example.com/not-found";
    // Cause FetchEngine.fetchContent to throw its HTTP error (404)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><title>Not Found</title></html>",
      url,
    });

    const engine = new HybridEngine();
    await expect(engine.fetchContent(url)).rejects.toHaveProperty("statusCode", 404);

    // Ensure PlaywrightEngine.fetchContent was not invoked
    const { PlaywrightEngine } = await import("../src/PlaywrightEngine");
    const pwInstance = (PlaywrightEngine as unknown as SpyInstance).mock.results[0].value;
    expect(pwInstance.fetchContent).not.toHaveBeenCalled();
  });

  it("falls back to Playwright on non-404 FetchEngine error", async () => {
    const url = "https://example.com/server-error";
    // 500 -> FetchEngine will throw, Hybrid should fall back to Playwright
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><title>Server Error</title></html>",
      url,
    });

    const engine = new HybridEngine();
    const res = await engine.fetchContent(url);
    expect(res.content).toBe("PW");
    const { PlaywrightEngine } = await import("../src/PlaywrightEngine");
    const pwInstance = (PlaywrightEngine as unknown as SpyInstance).mock.results[0].value;
    expect(pwInstance.fetchContent).toHaveBeenCalled();
  });
});


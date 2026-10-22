import axios, { type AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaywrightEngine } from "../src/PlaywrightEngine.js";
import { PlaywrightBrowserPool } from "../src/browser/PlaywrightBrowserPool.js";

vi.mock("../src/browser/PlaywrightBrowserPool.js");

describe("PlaywrightEngine.fetchContent HTTP fallback", () => {
  const url = "https://example.com/resource";
  const originalAdapter = axios.defaults.adapter;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    axios.defaults.adapter = originalAdapter;
  });

  function useResponse(options: {
    data: Buffer;
    headers: Record<string, string>;
    finalUrl?: string;
    status?: number;
  }): void {
    const adapter: AxiosAdapter = async (config) => ({
      data: options.data,
      status: options.status ?? 200,
      statusText: "OK",
      headers: options.headers,
      config,
      request: { res: { responseUrl: options.finalUrl } },
    });

    axios.defaults.adapter = adapter;
  }

  function createEngine(): PlaywrightEngine {
    return new PlaywrightEngine({
      cacheTTL: 0,
      maxRetries: 0,
      useHttpFallback: true,
    });
  }

  it("returns HTML text, title, status and redirected URL", async () => {
    const html = "<html><head><title>Fallback title</title></head><body>Fallback body</body></html>";
    const finalUrl = "https://example.com/final";
    useResponse({
      data: Buffer.from(html),
      headers: { "content-type": "text/html; charset=utf-8" },
      finalUrl,
    });

    const result = await createEngine().fetchContent(url);

    expect(result).toEqual({
      content: html,
      contentType: "text/html; charset=utf-8",
      title: "Fallback title",
      url: finalUrl,
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    });
    expect(PlaywrightBrowserPool).not.toHaveBeenCalled();
  });

  it("preserves binary response bytes and MIME type", async () => {
    const bytes = Buffer.from([0, 255, 1, 128, 42]);
    useResponse({
      data: bytes,
      headers: { "content-type": "image/png" },
    });

    const result = await createEngine().fetchContent(url);

    expect(Buffer.isBuffer(result.content)).toBe(true);
    expect(result.content).toEqual(bytes);
    expect(result.contentType).toBe("image/png");
    expect(result.title).toBeNull();
    expect(result.url).toBe(url);
    expect(result.isFromCache).toBe(false);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(PlaywrightBrowserPool).not.toHaveBeenCalled();
  });

  it("uses the octet-stream type when the response has no content type", async () => {
    const bytes = Buffer.from([7, 0, 240]);
    useResponse({ data: bytes, headers: {} });

    const result = await createEngine().fetchContent(url);

    expect(Buffer.isBuffer(result.content)).toBe(true);
    expect(result.content).toEqual(bytes);
    expect(result.contentType).toBe("application/octet-stream");
    expect(result.title).toBeNull();
    expect(result.url).toBe(url);
    expect(result.isFromCache).toBe(false);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
    expect(PlaywrightBrowserPool).not.toHaveBeenCalled();
  });
});

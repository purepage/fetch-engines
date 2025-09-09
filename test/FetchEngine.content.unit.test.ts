import { FetchEngine } from "../src/FetchEngine";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock global fetch for deterministic, no-network tests
const mockFetch = vi.fn();
// @ts-ignore
global.fetch = mockFetch;

describe("FetchEngine.fetchContent - unit", () => {
  const URL = "https://example.com/resource";

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns HTML as text with title and final URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><head><title>Hello</title></head><body>World</body></html>",
      url: URL,
    });

    const engine = new FetchEngine();
    const res = await engine.fetchContent(URL);
    expect(typeof res.content).toBe("string");
    expect(res.contentType).toBe("text/html");
    expect(res.title).toBe("Hello");
    expect(res.url).toBe(URL);
    expect(res.statusCode).toBe(200);
  });

  it("returns JSON as text when content-type is application/json", async () => {
    const json = { hello: "world" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify(json),
      url: URL,
    });

    const engine = new FetchEngine();
    const res = await engine.fetchContent(URL);
    expect(typeof res.content).toBe("string");
    expect(res.contentType).toContain("application/json");
    expect(() => JSON.parse(res.content as string)).not.toThrow();
  });

  it("returns Buffer for binary content (e.g., image/png)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => bytes,
      url: URL,
    });

    const engine = new FetchEngine();
    const res = await engine.fetchContent(URL);
    expect(Buffer.isBuffer(res.content)).toBe(true);
    expect(res.contentType).toBe("image/png");
    expect(res.title).toBeNull();
  });

  it("merges headers and sends custom ones", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "{}",
      url: URL,
    });

    const engine = new FetchEngine({ headers: { "X-From-Constructor": "A", "User-Agent": "UA-C" } });
    await engine.fetchContent(URL, { headers: { "X-From-Options": "B", "User-Agent": "UA-O" } });

    expect(mockFetch).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "*/*",
          "X-From-Constructor": "A",
          "X-From-Options": "B",
          "User-Agent": "UA-O", // options override constructor
        }),
      })
    );
  });

  it("propagates final redirected URL", async () => {
    const finalUrl = "https://example.com/final";
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<html><title>OK</title></html>",
      url: finalUrl,
    });

    const engine = new FetchEngine();
    const res = await engine.fetchContent(URL);
    expect(res.url).toBe(finalUrl);
  });
});


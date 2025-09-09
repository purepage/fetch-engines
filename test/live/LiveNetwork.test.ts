import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HybridEngine, FetchEngine } from "../../src/index.js";

// Only run when explicitly enabled to avoid CI flakiness
const RUN_LIVE = process.env.LIVE_NETWORK === "1";

describe.runIf(RUN_LIVE).sequential("Live Network Smoke", () => {
  let hybrid: HybridEngine;
  let fetcher: FetchEngine;

  beforeEach(() => {
    // Keep retries modest and fast mode on by default for speed
    hybrid = new HybridEngine({ maxRetries: 1, defaultFastMode: true, useHttpFallback: true });
    fetcher = new FetchEngine();
  });

  afterEach(async () => {
    await hybrid.cleanup();
    await fetcher.cleanup();
  });

  it("FetchEngine gets example.com HTML", async () => {
    const res = await fetcher.fetchContent("https://example.com");
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toContain("text/html");
    expect(typeof res.content).toBe("string");
    expect(res.title).toBeTruthy();
  }, 30000);

  it("HybridEngine follows redirects (httpbin)", async () => {
    const res = await hybrid.fetchContent("https://httpbin.org/redirect/2");
    expect(res.statusCode).toBe(200);
    // Final redirect destination for 2 redirects on httpbin is /get
    expect(res.url).toContain("/get");
  }, 45000);

  it("HybridEngine fetches JSON raw content (httpbin)", async () => {
    const res = await hybrid.fetchContent("https://httpbin.org/json");
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toContain("application/json");
    expect(typeof res.content).toBe("string");
  }, 30000);

  it("HybridEngine returns 404 without Playwright fallback", async () => {
    await expect(hybrid.fetchContent("https://httpbin.org/status/404")).rejects.toHaveProperty("statusCode", 404);
  }, 30000);
});


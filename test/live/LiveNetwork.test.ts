import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HybridEngine, FetchEngine } from "../../src/index.js";

// Only run when explicitly enabled to avoid CI flakiness
const RUN_LIVE = process.env.LIVE_NETWORK === "1";
const BLOCK_MARKERS = [
  "access denied",
  "blocked",
  "captcha",
  "checking your browser",
  "forbidden",
  "just a moment",
  "performing security verification",
  "verify you are human",
];

function assertNoBlockMarkers(content: string): void {
  const lowerContent = content.toLowerCase();
  expect(BLOCK_MARKERS.some((marker) => lowerContent.includes(marker))).toBe(false);
}

function assertStringContent(content: string | Buffer, minLength: number): asserts content is string {
  expect(typeof content).toBe("string");
  expect(content.length).toBeGreaterThan(minLength);
}

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
    assertStringContent(res.content, 100);
    assertNoBlockMarkers(res.content);
  }, 30000);

  it("HybridEngine fetches the BHP homepage as markdown", async () => {
    const res = await hybrid.fetchHTML("https://www.bhp.com/", { markdown: true });
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("markdown");
    expect(res.content.length).toBeGreaterThan(1500);
    expect(res.content).toContain("Source: https://www.bhp.com/");
    assertNoBlockMarkers(res.content);
  }, 45000);

  it.runIf(Boolean(process.env.LIVE_CDP_ENDPOINT || process.env.LIVE_BROWSER_EXECUTABLE))(
    "HybridEngine fetches the Juno Pure Devotion product page through Patchright",
    async () => {
      const junoUrl = "https://www.juno.co.uk/products/overmono-pure-devotion-vinyl/1156010-01/";
      const junoHybrid = new HybridEngine({
        browserDriver: "patchright",
        cdpEndpoint: process.env.LIVE_CDP_ENDPOINT || undefined,
        challengeWaitMs: 15_000,
        defaultFastMode: false,
        markdown: true,
        concurrentPages: 1,
        maxBrowsers: 1,
        maxRetries: 1,
        playwrightLaunchOptions: process.env.LIVE_CDP_ENDPOINT
          ? undefined
          : { executablePath: process.env.LIVE_BROWSER_EXECUTABLE },
        playwrightOnlyPatterns: ["juno.co.uk"],
        retryDelay: 2_000,
        useHeadedMode: !process.env.LIVE_CDP_ENDPOINT,
        useHttpFallback: false,
      });

      try {
        const res = await junoHybrid.fetchHTML(junoUrl, { fastMode: false, markdown: true });
        const normalizedContent = res.content.toLowerCase();

        expect(res.statusCode).toBe(200);
        expect(res.contentType).toBe("markdown");
        expect(res.title?.toLowerCase()).toContain("pure devotion");
        expect(normalizedContent).toContain("overmono");
        expect(normalizedContent).toContain("pure devotion");
        expect(res.content).toContain(`Source: ${junoUrl}`);
        assertNoBlockMarkers(res.content);
      } finally {
        await junoHybrid.cleanup();
      }
    },
    90000
  );

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
    assertStringContent(res.content, 50);
  }, 30000);

  it("HybridEngine returns 404 without Playwright fallback", async () => {
    await expect(hybrid.fetchContent("https://httpbin.org/status/404")).rejects.toHaveProperty("statusCode", 404);
  }, 30000);
});

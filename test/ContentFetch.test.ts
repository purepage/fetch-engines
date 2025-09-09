import { HybridEngine, FetchEngine } from "../src/index.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Content Fetch Tests", () => {
  let hybridEngine: HybridEngine;
  let fetchEngine: FetchEngine;

  beforeEach(() => {
    hybridEngine = new HybridEngine();
    fetchEngine = new FetchEngine();
  });

  afterEach(async () => {
    await hybridEngine.cleanup();
    await fetchEngine.cleanup();
  });

  describe("FetchEngine Content Fetch", () => {
    it("should fetch HTML content as text", async () => {
      const result = await fetchEngine.fetchContent("https://example.com");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toBe("text/html");
      expect(result.url).toContain("example.com");
      expect(result.statusCode).toBe(200);
      expect(result.title).toBeTruthy();
    });

    it("should handle custom headers", async () => {
      const result = await fetchEngine.fetchContent("https://httpbin.org/headers", {
        headers: {
          "X-Custom-Header": "test-value",
          "User-Agent": "CustomAgent/1.0",
        },
      });

      expect(result.content).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.contentType).toContain("application/json");

      // Parse JSON response to verify headers were sent
      const responseData = JSON.parse(result.content as string);
      expect(responseData.headers["X-Custom-Header"]).toBe("test-value");
      expect(responseData.headers["User-Agent"]).toBe("CustomAgent/1.0");
    });

    it("should return JSON content as string", async () => {
      const result = await fetchEngine.fetchContent("https://httpbin.org/json");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toContain("application/json");
      expect(result.statusCode).toBe(200);

      // Should be valid JSON
      expect(() => JSON.parse(result.content as string)).not.toThrow();
    });
  });

  describe("HybridEngine Content Fetch", () => {
    it("should fetch HTML content as text", async () => {
      const result = await hybridEngine.fetchContent("https://example.com");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toBe("text/html");
      expect(result.url).toContain("example.com");
      expect(result.statusCode).toBe(200);
      expect(result.title).toBeTruthy();
    });

    it("should handle custom headers", async () => {
      const result = await hybridEngine.fetchContent("https://httpbin.org/headers", {
        headers: {
          "X-Custom-Header": "hybrid-test-value",
          Accept: "application/json",
        },
      });

      expect(result.content).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.contentType).toContain("application/json");

      // Parse JSON response to verify headers were sent
      const responseData = JSON.parse(result.content as string);
      expect(responseData.headers["X-Custom-Header"]).toBe("hybrid-test-value");
      expect(responseData.headers["Accept"]).toBe("application/json");
    });

    it("should return JSON content as string", async () => {
      const result = await hybridEngine.fetchContent("https://httpbin.org/json");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toContain("application/json");
      expect(result.statusCode).toBe(200);

      // Should be valid JSON
      expect(() => JSON.parse(result.content as string)).not.toThrow();
    });

    it("should handle complex sites that require Playwright fallback", async () => {
      // This site might require Playwright for proper rendering
      const result = await hybridEngine.fetchContent("https://quotes.toscrape.com/");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toContain("text/html");
      expect(result.statusCode).toBe(200);
      expect(result.title).toBeTruthy();
    });

    it("should handle binary content (simulated with a small image)", async () => {
      // Test with httpbin's image endpoint
      const result = await hybridEngine.fetchContent("https://httpbin.org/image/png");

      expect(result.content).toBeDefined();
      expect(Buffer.isBuffer(result.content)).toBe(true);
      expect(result.contentType).toBe("image/png");
      expect(result.statusCode).toBe(200);
      expect(result.title).toBeNull(); // No title for binary content
    });

    it("should handle XML content", async () => {
      const result = await hybridEngine.fetchContent("https://httpbin.org/xml");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.contentType).toContain("application/xml");
      expect(result.statusCode).toBe(200);
      expect(result.title).toBeNull(); // No title extraction for XML
    });

    it("should handle redirects properly", async () => {
      const result = await hybridEngine.fetchContent("https://httpbin.org/redirect/3");

      expect(result.content).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.url).toBe("https://httpbin.org/get"); // Final redirect destination
    });

    it("should handle errors gracefully", async () => {
      // Create a HybridEngine with reduced retries for faster testing
      const fastEngine = new HybridEngine({ maxRetries: 1 });

      try {
        await expect(fastEngine.fetchContent("https://httpbin.org/status/404")).rejects.toThrow();
      } finally {
        await fastEngine.cleanup();
      }
    }, 15000); // Reduced timeout since we're using fewer retries

    it("should handle non-HTML content differently", async () => {
      // fetchHTML will return raw content for non-HTML types
      const contentResult = await hybridEngine.fetchContent("https://httpbin.org/json");
      expect(contentResult.content).toBeDefined();
      expect(contentResult.contentType).toContain("application/json");

      // fetchHTML falls back and returns the same raw content
      const htmlResult = await hybridEngine.fetchHTML("https://httpbin.org/json");
      expect(htmlResult.contentType).toBe("html");
      expect(htmlResult.content).toBe(contentResult.content); // Same processing
    });
  });

  describe("Content vs HTML Fetch Comparison", () => {
    it("should return different content types for same URL", async () => {
      const htmlResult = await hybridEngine.fetchHTML("https://example.com");
      const contentResult = await hybridEngine.fetchContent("https://example.com");

      // HTML fetch processes content
      expect(htmlResult.contentType).toBe("html");
      expect(typeof htmlResult.content).toBe("string");

      // Content fetch returns raw content
      expect(contentResult.contentType).toBe("text/html");
      expect(typeof contentResult.content).toBe("string");

      // Both should have title
      expect(htmlResult.title).toBeTruthy();
      expect(contentResult.title).toBeTruthy();
    });

    it("should handle non-HTML content differently", async () => {
      // fetchHTML will return raw content for non-HTML types
      const contentResult = await hybridEngine.fetchContent("https://httpbin.org/json");
      expect(contentResult.content).toBeDefined();
      expect(contentResult.contentType).toContain("application/json");

      // fetchHTML falls back and returns the same raw content
      const htmlResult = await hybridEngine.fetchHTML("https://httpbin.org/json");
      expect(htmlResult.contentType).toBe("html");
      expect(htmlResult.content).toBe(contentResult.content); // Same processing
    });
  });
});

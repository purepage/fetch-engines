import { FetchEngine } from "../src/FetchEngine"; // Adjust path if necessary
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("FetchEngine - Headers", () => {
  const MOCK_URL = "http://example.com";
  const DEFAULT_BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  beforeEach(() => {
    mockFetch.mockReset();
    // Basic successful response mock
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "text/html" }),
      text: async () => "<html><head><title>Test</title></head><body>Hello</body></html>",
      url: MOCK_URL,
    });
  });

  // 1. No Custom Headers (Defaults)
  it("should use default headers if no custom headers are provided", async () => {
    const engine = new FetchEngine();
    await engine.fetchHTML(MOCK_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: DEFAULT_BASE_HEADERS })
    );
  });

  // 2. Constructor Headers
  it("should use constructor headers and merge with defaults (new header)", async () => {
    const constructorHeaders = { "X-Custom-Header": "constructor-value" };
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({
        headers: { ...DEFAULT_BASE_HEADERS, ...constructorHeaders },
      })
    );
  });

  it("should override default User-Agent with constructor header", async () => {
    const constructorHeaders = { "User-Agent": "CustomConstructorAgent/1.0" };
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({
        headers: { ...DEFAULT_BASE_HEADERS, "User-Agent": "CustomConstructorAgent/1.0" },
      })
    );
  });

  // 3. `fetchHTML` Option Headers
  it("should use fetchHTML options headers and merge with defaults (no constructor headers)", async () => {
    const fetchOptionsHeaders = { "X-Fetch-Option-Header": "fetch-option-value" };
    const engine = new FetchEngine(); // No constructor headers
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({
        headers: { ...DEFAULT_BASE_HEADERS, ...fetchOptionsHeaders },
      })
    );
  });

  it("should override default User-Agent with fetchHTML options header (no constructor headers)", async () => {
    const fetchOptionsHeaders = { "User-Agent": "CustomFetchOptionsAgent/1.0" };
    const engine = new FetchEngine(); // No constructor headers
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({
        headers: { ...DEFAULT_BASE_HEADERS, "User-Agent": "CustomFetchOptionsAgent/1.0" },
      })
    );
  });

  it("should use fetchHTML options headers, overriding constructor headers", async () => {
    const constructorHeaders = { "X-Constructor-Header": "constructor-val", "User-Agent": "ConstructorAgent" };
    const fetchOptionsHeaders = { "X-Fetch-Header": "fetch-val", "User-Agent": "FetchAgent" };
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

    const expectedHeaders = {
      ...DEFAULT_BASE_HEADERS,   // Defaults for Accept, Accept-Language
      "X-Constructor-Header": "constructor-val", // From constructor
      "X-Fetch-Header": "fetch-val",             // From fetchOptions
      "User-Agent": "FetchAgent",                // Overridden by fetchOptions
    };
    
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: expectedHeaders })
    );
  });

  it("should merge fetchHTML options headers with constructor headers for different keys", async () => {
    const constructorHeaders = { "X-Constructor-Unique": "constructor-unique-val" };
    const fetchOptionsHeaders = { "X-Fetch-Unique": "fetch-unique-val" };
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

    const expectedHeaders = {
      ...DEFAULT_BASE_HEADERS,
      "X-Constructor-Unique": "constructor-unique-val",
      "X-Fetch-Unique": "fetch-unique-val",
    };
    
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: expectedHeaders })
    );
  });


  // 4. Mixed Scenarios & Precedence
  it("should use headers from default, constructor, and fetchHTML options when all have unique keys", async () => {
    const constructorHeaders = { "X-Constructor-Mixed": "constructor-mixed-val" };
    const fetchOptionsHeaders = { "X-Fetch-Mixed": "fetch-mixed-val" };
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

    const expectedHeaders = {
      ...DEFAULT_BASE_HEADERS,
      "X-Constructor-Mixed": "constructor-mixed-val",
      "X-Fetch-Mixed": "fetch-mixed-val",
    };
    
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: expectedHeaders })
    );
  });

  it("should prioritize fetchHTML options header when same key is in default, constructor, and options", async () => {
    // 'User-Agent' is in DEFAULT_BASE_HEADERS
    const constructorHeaders = { "User-Agent": "ConstructorUserAgentOverride", "X-Constructor-Only": "constructor-only" };
    const fetchOptionsHeaders = { "User-Agent": "FetchOptionsUserAgentUltimateOverride" };
    
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

    const expectedHeaders = {
      ...DEFAULT_BASE_HEADERS, // Accept, Accept-Language will remain
      "X-Constructor-Only": "constructor-only", // From constructor
      "User-Agent": "FetchOptionsUserAgentUltimateOverride", // fetchHTML options win
    };
    
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: expectedHeaders })
    );
  });

  it("should correctly merge when constructor provides some overrides and options provide others", async () => {
    const constructorHeaders = { "User-Agent": "ConstructorAgent", "X-From-Constructor": "val1" };
    const fetchOptionsHeaders = { "Accept-Language": "fr-FR", "X-From-Options": "val2" };
    
    const engine = new FetchEngine({ headers: constructorHeaders });
    await engine.fetchHTML(MOCK_URL, { headers: fetchOptionsHeaders });

    const expectedHeaders = {
      "User-Agent": "ConstructorAgent", // From constructor, overrides default
      "Accept": DEFAULT_BASE_HEADERS.Accept, // From default
      "Accept-Language": "fr-FR", // From options, overrides default
      "X-From-Constructor": "val1", // From constructor
      "X-From-Options": "val2",   // From options
    };
    
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: expectedHeaders })
    );
  });

  // Test for empty headers objects
  it("should handle empty headers object from constructor", async () => {
    const engine = new FetchEngine({ headers: {} });
    await engine.fetchHTML(MOCK_URL);
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: DEFAULT_BASE_HEADERS })
    );
  });

  it("should handle empty headers object from fetchHTML options", async () => {
    const engine = new FetchEngine();
    await engine.fetchHTML(MOCK_URL, { headers: {} });
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: DEFAULT_BASE_HEADERS })
    );
  });

  it("should handle empty headers objects from both constructor and fetchHTML options", async () => {
    const engine = new FetchEngine({ headers: {} });
    await engine.fetchHTML(MOCK_URL, { headers: {} });
    expect(mockFetch).toHaveBeenCalledWith(
      MOCK_URL,
      expect.objectContaining({ headers: DEFAULT_BASE_HEADERS })
    );
  });
});

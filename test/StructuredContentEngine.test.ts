import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { StructuredContentEngine, fetchStructuredContent } from "../src/StructuredContentEngine.js";

// Mock AI SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mocked-model"),
}));

// Mock HybridEngine
vi.mock("../src/HybridEngine.js", () => ({
  HybridEngine: vi.fn().mockImplementation(() => ({
    fetchHTML: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

describe("StructuredContentEngine", () => {
  let engine: StructuredContentEngine;
  let mockGenerateObject: any;
  let mockHybridEngine: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up environment variable
    process.env.OPENAI_API_KEY = "test-api-key";

    // Initialize mocks
    mockGenerateObject = vi.mocked(await import("ai")).generateObject;
    mockHybridEngine = vi.mocked(await import("../src/HybridEngine.js")).HybridEngine;

    engine = new StructuredContentEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
    delete process.env.OPENAI_API_KEY;
  });

  describe("constructor", () => {
    it("should create a HybridEngine with markdown enabled", () => {
      expect(mockHybridEngine).toHaveBeenCalledWith({
        markdown: true,
      });
    });

    it("should pass through configuration options", () => {
      const config = { spaMode: true, spaRenderDelayMs: 2000 };
      new StructuredContentEngine(config);

      expect(mockHybridEngine).toHaveBeenCalledWith({
        ...config,
        markdown: true,
      });
    });
  });

  describe("fetchStructuredContent", () => {
    const testSchema = z.object({
      title: z.string(),
      author: z.string().optional(),
    });

    const mockHtmlResult = {
      content: "# Test Article\n\nBy John Doe\n\nThis is a test article.",
      contentType: "markdown" as const,
      title: "Test Article",
      url: "https://example.com/article",
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    };

    const mockAiResult = {
      object: {
        title: "Test Article",
        author: "John Doe",
      },
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    };

    beforeEach(() => {
      const mockInstance = engine["hybridEngine"] as any;
      mockInstance.fetchHTML.mockResolvedValue(mockHtmlResult);
      mockGenerateObject.mockResolvedValue(mockAiResult);
    });

    it("should throw error if OPENAI_API_KEY is not set", async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(engine.fetchStructuredContent("https://example.com", testSchema)).rejects.toThrow(
        "OPENAI_API_KEY environment variable is required"
      );
    });

    it("should fetch content and extract structured data", async () => {
      const result = await engine.fetchStructuredContent("https://example.com/article", testSchema);

      expect(result).toEqual({
        data: mockAiResult.object,
        markdown: mockHtmlResult.content,
        url: mockHtmlResult.url,
        title: mockHtmlResult.title,
        usage: mockAiResult.usage,
      });
    });

    it("should use default model gpt-5-mini with reasoning_effort: low", async () => {
      await engine.fetchStructuredContent("https://example.com", testSchema);

      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: "mocked-model",
        schema: testSchema,
        prompt: expect.stringContaining("You are an expert at extracting structured data"),
        providerOptions: {
          openai: {
            reasoning_effort: "low",
          },
        },
      });
    });

    it("should use gpt-4.1 model with temperature: 0", async () => {
      await engine.fetchStructuredContent("https://example.com", testSchema, {
        model: "gpt-4.1",
      });

      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: "mocked-model",
        schema: testSchema,
        prompt: expect.stringContaining("You are an expert at extracting structured data"),
        temperature: 0,
      });
    });

    it("should use gpt-5 model with reasoning_effort: low", async () => {
      await engine.fetchStructuredContent("https://example.com", testSchema, {
        model: "gpt-5",
      });

      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: "mocked-model",
        schema: testSchema,
        prompt: expect.stringContaining("You are an expert at extracting structured data"),
        providerOptions: {
          openai: {
            reasoning_effort: "low",
          },
        },
      });
    });

    it("should include custom prompt when provided", async () => {
      const customPrompt = "Focus on extracting accurate information";

      await engine.fetchStructuredContent("https://example.com", testSchema, {
        customPrompt,
      });

      expect(mockGenerateObject).toHaveBeenCalledWith({
        model: "mocked-model",
        schema: testSchema,
        prompt: expect.stringContaining(`Additional context: ${customPrompt}`),
        providerOptions: {
          openai: {
            reasoning_effort: "low",
          },
        },
      });
    });

    it("should throw error if content is not markdown", async () => {
      const mockInstance = engine["hybridEngine"] as any;
      mockInstance.fetchHTML.mockResolvedValue({
        ...mockHtmlResult,
        contentType: "html",
      });

      await expect(engine.fetchStructuredContent("https://example.com", testSchema)).rejects.toThrow(
        "Failed to convert content to markdown"
      );
    });

    it("should throw error if AI extraction fails", async () => {
      mockGenerateObject.mockRejectedValue(new Error("AI extraction failed"));

      await expect(engine.fetchStructuredContent("https://example.com", testSchema)).rejects.toThrow(
        "Failed to extract structured data: AI extraction failed"
      );
    });

    it("should pass engine config options to HybridEngine fetchHTML", async () => {
      const mockInstance = engine["hybridEngine"] as any;
      const engineConfig = { spaMode: true };

      await engine.fetchStructuredContent("https://example.com", testSchema, {
        engineConfig,
      });

      expect(mockInstance.fetchHTML).toHaveBeenCalledWith("https://example.com", {
        markdown: true,
        ...engineConfig,
      });
    });
  });

  describe("cleanup", () => {
    it("should call cleanup on HybridEngine", async () => {
      const mockInstance = engine["hybridEngine"] as any;
      await engine.cleanup();

      expect(mockInstance.cleanup).toHaveBeenCalled();
    });
  });
});

describe("fetchStructuredContent convenience function", () => {
  const testSchema = z.object({
    title: z.string(),
  });

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("should create engine, fetch data, and cleanup", async () => {
    const mockHtmlResult = {
      content: "# Test Title",
      contentType: "markdown" as const,
      title: "Test Title",
      url: "https://example.com",
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    };

    const mockAiResult = {
      object: { title: "Test Title" },
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
    };

    const mockInstance = {
      fetchHTML: vi.fn().mockResolvedValue(mockHtmlResult),
      cleanup: vi.fn(),
    };

    const { generateObject } = await import("ai");
    const mockGenerateObject = vi.mocked(generateObject);
    mockGenerateObject.mockResolvedValue(mockAiResult);

    const { HybridEngine } = await import("../src/HybridEngine.js");
    const mockHybridEngine = vi.mocked(HybridEngine);
    mockHybridEngine.mockImplementation(() => mockInstance as any);

    const result = await fetchStructuredContent("https://example.com", testSchema);

    expect(result.data).toEqual(mockAiResult.object);
    expect(mockInstance.cleanup).toHaveBeenCalled();
  });
});

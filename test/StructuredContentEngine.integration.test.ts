// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const hybridMocks = vi.hoisted(() => ({
  fetchHTML: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("../src/HybridEngine.js", () => ({
  HybridEngine: class {
    fetchHTML = hybridMocks.fetchHTML;
    cleanup = hybridMocks.cleanup;
  },
}));

import { StructuredContentEngine } from "../src/StructuredContentEngine.js";

const responseUsage = {
  promptTokens: 17,
  completionTokens: 11,
  totalTokens: 28,
};

function chatCompletionResponse(content: string, usage = responseUsage): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-integration-test",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "gpt-4.1-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        total_tokens: usage.totalTokens,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function openAIResponsesResponse(content: string, usage = responseUsage, model = "gpt-4.1-mini"): Response {
  return new Response(
    JSON.stringify({
      id: "resp-integration-test",
      object: "response",
      created_at: 1_700_000_000,
      status: "completed",
      model,
      output: [
        {
          id: "msg-integration-test",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: content, annotations: [] }],
        },
      ],
      usage: {
        input_tokens: usage.promptTokens,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: usage.completionTokens,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: usage.totalTokens,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function getRequestBody(call: [RequestInfo | URL, RequestInit?]): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
}

describe("StructuredContentEngine with the real AI SDK", () => {
  let engine: StructuredContentEngine;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "integration-test-key");
    vi.stubEnv("OPENROUTER_API_KEY", undefined);

    hybridMocks.fetchHTML.mockResolvedValue({
      content: "# Integration article\n\nA short article for structured extraction.",
      contentType: "markdown",
      title: "Integration article",
      url: "https://example.com/article",
      isFromCache: false,
      statusCode: 200,
      error: undefined,
    });
    hybridMocks.cleanup.mockResolvedValue(undefined);

    fetchMock = vi.fn(function () {
      return Promise.resolve(openAIResponsesResponse('{"title":"Extracted title"}'));
    });
    vi.stubGlobal("fetch", fetchMock);
    engine = new StructuredContentEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends a standard OpenAI Responses API request and maps its result and token usage", async () => {
    const schema = z.object({
      title: z.string().describe("The extracted title"),
    });

    const result = await engine.fetchStructuredContent("https://example.com/article", schema, {
      model: "gpt-4.1-mini",
      apiConfig: {
        apiKey: "openai-test-key",
        headers: { "X-Client-Name": "fetch-engines-test" },
      },
    });

    expect(result.data).toEqual({ title: "Extracted title" });
    expect(result.usage).toEqual({ promptTokens: 17, completionTokens: 11, totalTokens: 28 });
    expect(result.markdown).toContain("Integration article");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    expect(new URL(String(requestUrl)).pathname).toBe("/v1/responses");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer openai-test-key");
    expect(new Headers(requestInit?.headers).get("x-client-name")).toBe("fetch-engines-test");
    expect(getRequestBody([requestUrl, requestInit]).model).toBe("gpt-4.1-mini");
  });

  it("sends custom-provider requests to the compatible chat endpoint with SDK auth", async () => {
    fetchMock.mockResolvedValueOnce(chatCompletionResponse('{"title":"Compatible title"}'));
    const schema = z.object({
      title: z.string().describe("The extracted title"),
    });

    const result = await engine.fetchStructuredContent("https://example.com/article", schema, {
      model: "provider/model-name",
      apiConfig: {
        apiKey: "compatible-test-key",
        baseURL: "https://llm.example.test/v1/",
        headers: { "X-Provider-Context": "integration-test" },
      },
    });

    expect(result.data).toEqual({ title: "Compatible title" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    expect(String(requestUrl)).toBe("https://llm.example.test/v1/chat/completions");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe("Bearer compatible-test-key");
    expect(new Headers(requestInit?.headers).get("x-provider-context")).toBe("integration-test");
    expect(getRequestBody([requestUrl, requestInit]).model).toBe("provider/model-name");
  });

  it("accepts an omitted optional field from a custom provider in JSON mode", async () => {
    fetchMock.mockResolvedValueOnce(chatCompletionResponse('{"title":"Compatible title"}'));
    const schema = z.object({
      title: z.string().describe("The extracted title"),
      author: z.string().describe("The author, when present").optional(),
    });

    const result = await engine.fetchStructuredContent("https://example.com/article", schema, {
      model: "provider/model-name",
      apiConfig: {
        apiKey: "compatible-test-key",
        baseURL: "https://llm.example.test/v1/",
      },
    });

    expect(result.data).toEqual({ title: "Compatible title" });
    const requestBody = getRequestBody(fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?]);
    expect(requestBody.response_format).toEqual({ type: "json_object" });
  });

  it("accepts an omitted optional field from the model output", async () => {
    fetchMock.mockResolvedValueOnce(openAIResponsesResponse('{"title":"Optional field omitted"}'));
    const schema = z.object({
      title: z.string().describe("The extracted title"),
      author: z.string().describe("The author, when present").optional(),
    });

    const result = await engine.fetchStructuredContent("https://example.com/article", schema, {
      model: "gpt-4.1-mini",
    });

    expect(result.data).toEqual({ title: "Optional field omitted" });

    const requestBody = getRequestBody(fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?]);
    expect(requestBody.text).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({ type: "json_schema", strict: false }),
      })
    );
  });

  it("sends the configured low reasoning effort for GPT-5 models", async () => {
    fetchMock.mockResolvedValueOnce(openAIResponsesResponse('{"title":"Reasoned title"}', responseUsage, "gpt-5-mini"));
    const schema = z.object({
      title: z.string().describe("The extracted title"),
    });

    await engine.fetchStructuredContent("https://example.com/article", schema, { model: "gpt-5-mini" });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    expect(new URL(String(requestUrl)).pathname).toBe("/v1/responses");
    const requestBody = getRequestBody([requestUrl, requestInit]);
    expect(requestBody.reasoning).toEqual({ effort: "low" });
  });

  it("reports a model response that fails Zod validation as an extraction error", async () => {
    fetchMock.mockResolvedValueOnce(openAIResponsesResponse('{"title":42}'));
    const schema = z.object({
      title: z.string().describe("The extracted title"),
    });

    await expect(
      engine.fetchStructuredContent("https://example.com/article", schema, { model: "gpt-4.1-mini" })
    ).rejects.toThrow("Model response:");
  });
});

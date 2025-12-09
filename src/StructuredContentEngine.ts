import { generateObject, NoObjectGeneratedError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { HybridEngine } from "./HybridEngine.js";
import type { PlaywrightEngineConfig } from "./types.js";

// Suppress AI SDK warnings about responseFormat/structuredOutputs
// This warning appears when using OpenAI-compatible APIs that don't support structured outputs
if (typeof globalThis !== "undefined") {
  (globalThis as any).AI_SDK_LOG_WARNINGS = false;
}

/**
 * Configuration for OpenAI-compatible API providers
 */
export interface ApiConfig {
  /** API key for the provider. Defaults to OPENAI_API_KEY environment variable */
  apiKey?: string;
  /** Base URL for the API. Use this for OpenAI-compatible APIs like OpenRouter */
  baseURL?: string;
  /** Custom headers to include in API requests */
  headers?: Record<string, string>;
}

/**
 * Configuration options for structured content fetching
 */
export interface StructuredContentOptions {
  /** Model to use (required). Use any model name supported by your API provider (e.g., 'gpt-4.1-mini', 'anthropic/claude-3.5-sonnet' for OpenRouter) */
  model: string;
  /** Custom prompt to provide additional context to the LLM */
  customPrompt?: string;
  /** HybridEngine configuration for content fetching */
  engineConfig?: PlaywrightEngineConfig;
  /** API configuration for OpenAI-compatible providers (OpenRouter, etc.) */
  apiConfig?: ApiConfig;
}

/**
 * Result of structured content extraction
 */
export interface StructuredContentResult<T> {
  /** The structured data extracted from the content */
  data: T;
  /** The original markdown content that was processed */
  markdown: string;
  /** The URL that was processed */
  url: string;
  /** The title of the page if available */
  title: string | null;
  /** Token usage information */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Engine for fetching web content and extracting structured data using AI
 */
export class StructuredContentEngine {
  private hybridEngine: HybridEngine;

  constructor(config: PlaywrightEngineConfig = {}) {
    // Always enable markdown conversion for structured content
    this.hybridEngine = new HybridEngine({
      ...config,
      markdown: true,
    });
  }

  /**
   * Extracts field descriptions from a Zod object schema
   * @private
   */
  private extractFieldDescriptions(schema: z.ZodSchema): Map<string, string> {
    const descriptions = new Map<string, string>();

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      for (const [key, fieldSchema] of Object.entries(shape)) {
        // In Zod v4, description is stored directly on the schema object
        let description: string | undefined;
        const fieldSchemaAny = fieldSchema as any;
        const def = fieldSchemaAny._def;

        // Handle optional fields - check innerType for description
        // When using .describe().optional(), description is on innerType
        // When using .optional().describe(), description is on the optional wrapper
        if (def?.typeName === "ZodOptional") {
          description = fieldSchemaAny._def?.innerType?.description || fieldSchemaAny.description;
        } else {
          description = fieldSchemaAny.description;
        }

        if (description) {
          descriptions.set(key, description);
        }
      }
    }

    return descriptions;
  }

  /**
   * Validates that all fields in the schema have descriptions
   * @private
   */
  private validateSchemaDescriptions(schema: z.ZodSchema): void {
    if (!(schema instanceof z.ZodObject)) {
      throw new Error("Schema must be a Zod object. Use z.object() to define your schema structure.");
    }

    const shape = schema.shape;
    const missingDescriptions: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fieldSchemaAny = fieldSchema as any;

      // In Zod v4, description is stored directly on the schema object
      // Check if it's an optional field by checking for innerType
      let hasDescription = false;

      // Check if this is an optional field (has innerType)
      if (fieldSchemaAny._def?.innerType) {
        // For optional fields:
        // - When using .describe().optional(), description is on innerType
        // - When using .optional().describe(), description is on the optional wrapper
        hasDescription = !!(fieldSchemaAny._def.innerType.description || fieldSchemaAny.description);
      } else {
        // For non-optional fields, description is directly on the schema
        hasDescription = !!fieldSchemaAny.description;
      }

      if (!hasDescription) {
        missingDescriptions.push(key);
      }
    }

    if (missingDescriptions.length > 0) {
      throw new Error(
        `All schema fields must have descriptions. Missing descriptions for: ${missingDescriptions.join(", ")}\n\n` +
          `Example:\n` +
          `z.object({\n` +
          `  ${missingDescriptions[0]}: z.string().describe("Description of ${missingDescriptions[0]}"),\n` +
          `  // ... other fields\n` +
          `})`
      );
    }
  }

  /**
   * Fetches content from a URL and extracts structured data using AI
   *
   * @param url The URL to fetch content from
   * @param schema Zod schema defining the structure of data to extract (all fields must have .describe() calls)
   * @param options Additional options for the extraction process
   * @returns Promise resolving to structured data and metadata
   * @throws Error if API key is not set, if schema fields lack descriptions, or if extraction fails
   */
  async fetchStructuredContent<T>(
    url: string,
    schema: z.ZodSchema<T>,
    options: StructuredContentOptions
  ): Promise<StructuredContentResult<T>> {
    const { model, customPrompt = "", engineConfig = {}, apiConfig = {} } = options;

    const apiKey = apiConfig.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "API key is required for structured content extraction. Provide it via apiConfig.apiKey or set OPENAI_API_KEY or OPENROUTER_API_KEY environment variables"
      );
    }

    const result = await this.hybridEngine.fetchHTML(url, {
      markdown: true,
      ...engineConfig,
    });

    if (result.contentType !== "markdown") {
      throw new Error("Failed to convert content to markdown");
    }

    // Validate that all fields have descriptions
    this.validateSchemaDescriptions(schema);

    // Extract field descriptions to include in prompt
    const fieldDescriptions = this.extractFieldDescriptions(schema);
    const schemaGuidance = Array.from(fieldDescriptions.entries())
      .map(([field, description]) => `- ${field}: ${description}`)
      .join("\n");

    const systemPrompt = `You are an expert at extracting structured data from web content. 
Extract the requested information from the provided markdown content accurately and completely.
Return the data as a valid JSON object matching the exact schema provided.

Field requirements:
${schemaGuidance}

IMPORTANT: Pay careful attention to data types:
- Numbers should be returned as numeric values (not strings with currency symbols)
- Strings should be returned as plain text strings
- Follow the exact schema structure and field descriptions provided above

${customPrompt ? `\nAdditional context: ${customPrompt}` : ""}

Content to analyze:
${result.content}`;

    const modelConfig = this.getModelConfig(model);

    // Build headers - for OpenAI-compatible providers, don't add Authorization header
    // as createOpenAICompatible handles it via apiKey parameter
    const normalizedBaseURL = apiConfig.baseURL?.replace(/\/+$/, "");
    const defaultOpenAIBaseURL = "https://api.openai.com/v1";
    const isOpenAICompatible = normalizedBaseURL && normalizedBaseURL !== defaultOpenAIBaseURL;

    const headers = {
      ...(apiConfig.headers ?? {}),
      // Only add Authorization header for standard OpenAI API
      // OpenAI-compatible providers handle auth via apiKey parameter in createOpenAICompatible
      ...(!isOpenAICompatible && !apiConfig.headers?.Authorization ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const openai = this.getOpenAIProvider({
      apiKey,
      baseURL: apiConfig.baseURL,
      headers,
    });

    try {
      const aiResult = await generateObject({
        model: openai(model),
        schema,
        prompt: systemPrompt,
        ...modelConfig,
      });

      return {
        data: aiResult.object,
        markdown: result.content,
        url: result.url,
        title: result.title,
        usage: {
          promptTokens: aiResult.usage?.inputTokens ?? 0,
          completionTokens: aiResult.usage?.outputTokens ?? 0,
          totalTokens: aiResult.usage?.totalTokens ?? 0,
        },
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const errorMessage = `Failed to extract structured data: ${error.message}`;
        const details: string[] = [];

        // Get expected keys from schema
        const expectedKeys = schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];

        if (error.text) {
          // Try to parse and format the JSON response if possible
          let formattedResponse = error.text;
          let hasWeirdKeys = false;
          let receivedKeys: string[] = [];

          try {
            const parsed = JSON.parse(error.text);
            formattedResponse = JSON.stringify(parsed, null, 2);
            receivedKeys = Object.keys(parsed);
            // Check if keys have weird prefixes (like dots) or don't match expected keys
            hasWeirdKeys = receivedKeys.some(
              (key) =>
                key.startsWith(".") || key.includes(" ") || (expectedKeys.length > 0 && !expectedKeys.includes(key))
            );
          } catch {
            // Not valid JSON, show raw text
            formattedResponse = error.text.substring(0, 300) + (error.text.length > 300 ? "..." : "");
          }

          if (hasWeirdKeys && expectedKeys.length > 0) {
            details.push(`⚠️  Key mismatch detected:`);
            details.push(`   Expected: ${expectedKeys.join(", ")}`);
            details.push(`   Received: ${receivedKeys.join(", ")}`);
            details.push(
              `\n   The model returned keys with unexpected format (possibly prefixed with dots or spaces).`
            );
            details.push(`   This usually indicates the model doesn't properly support structured outputs.`);
          }

          details.push(`Model response:\n${formattedResponse}`);
        }

        if (error.finishReason && error.finishReason !== "unknown") {
          details.push(`Finish reason: ${error.finishReason}`);
        }

        if (error.cause) {
          const causeMessage = error.cause instanceof Error ? error.cause.message : String(error.cause);
          // Parse Zod validation errors if present
          if (causeMessage.includes("Type validation failed")) {
            try {
              // Try to extract the error message array from the cause
              const zodErrorsMatch = causeMessage.match(/Error message:\s*(\[[\s\S]*\])/);
              if (zodErrorsMatch) {
                const zodErrors = JSON.parse(zodErrorsMatch[1]);
                const formattedErrors = zodErrors
                  .map((err: { path: string[]; message: string; expected: string; received: string }) => {
                    const path = err.path.length > 0 ? err.path.join(".") : "root";
                    const received = err.received || "unknown";
                    return `  • ${path}: ${err.message} (expected ${err.expected}, received ${received})`;
                  })
                  .join("\n");
                details.push(`\nSchema validation errors:\n${formattedErrors}`);

                // Detect common type mismatches and provide helpful suggestions
                const typeMismatches = zodErrors.filter(
                  (err: { expected: string; received: string }) =>
                    err.expected === "number" && err.received === "string"
                );
                if (typeMismatches.length > 0) {
                  const mismatchedFields = typeMismatches
                    .map((err: { path: string[] }) => err.path.join("."))
                    .join(", ");
                  details.push(
                    `\n💡 Tip: Fields (${mismatchedFields}) are being returned as strings but expected as numbers.`
                  );
                  details.push(
                    `   Consider using Zod transforms to handle currency strings or other formatted numbers:`
                  );
                  details.push(`   Example: z.string().transform((val) => parseFloat(val.replace(/[^0-9.-]/g, "")))`);
                }
              } else {
                // Fallback: show the cause message
                const shortCause = causeMessage.length > 200 ? causeMessage.substring(0, 200) + "..." : causeMessage;
                details.push(`\nValidation error: ${shortCause}`);
              }
            } catch {
              // If parsing fails, show a shortened version
              const shortCause = causeMessage.length > 300 ? causeMessage.substring(0, 300) + "..." : causeMessage;
              details.push(`\nCause: ${shortCause}`);
            }
          } else {
            const shortCause = causeMessage.length > 300 ? causeMessage.substring(0, 300) + "..." : causeMessage;
            details.push(`\nCause: ${shortCause}`);
          }
        }

        const fullMessage =
          details.length > 0
            ? `${errorMessage}\n\n${details.join("\n")}\n\n💡 Tip: This model may not support structured outputs properly. Try using a model that supports structured outputs (e.g., gpt-4o-mini, gpt-4o, claude-3.5-sonnet).`
            : errorMessage;

        throw new Error(fullMessage);
      }

      throw new Error(`Failed to extract structured data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getOpenAIProvider(params: { apiKey: string; baseURL?: string; headers: Record<string, string> }) {
    const normalizedBaseURL = params.baseURL?.replace(/\/+$/, "");
    const defaultOpenAIBaseURL = "https://api.openai.com/v1";

    if (normalizedBaseURL && normalizedBaseURL !== defaultOpenAIBaseURL) {
      return createOpenAICompatible({
        name: "openai-compatible",
        apiKey: params.apiKey,
        baseURL: normalizedBaseURL,
        headers: params.headers,
      });
    }

    return createOpenAI({
      apiKey: params.apiKey,
      ...(normalizedBaseURL && { baseURL: normalizedBaseURL }),
      headers: params.headers,
    });
  }

  /**
   * Get model-specific configuration options
   */
  private getModelConfig(model: string) {
    if (model.startsWith("gpt-5")) {
      return {
        providerOptions: {
          openai: {
            reasoning_effort: "low",
          },
        },
      };
    } else if (model.startsWith("gpt-4.1")) {
      return {
        temperature: 0,
      };
    }
    return {};
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.hybridEngine.cleanup();
  }
}

/**
 * Convenience function for one-off structured content extraction
 *
 * @param url The URL to fetch content from
 * @param schema Zod schema defining the structure of data to extract
 * @param options Additional options for the extraction process
 * @returns Promise resolving to structured data and metadata
 */
export async function fetchStructuredContent<T>(
  url: string,
  schema: z.ZodSchema<T>,
  options: StructuredContentOptions
): Promise<StructuredContentResult<T>> {
  const engine = new StructuredContentEngine(options.engineConfig);
  try {
    return await engine.fetchStructuredContent(url, schema, options);
  } finally {
    await engine.cleanup();
  }
}

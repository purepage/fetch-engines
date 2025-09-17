import { inspect } from "node:util";

export interface FetchErrorDetails {
  name: string;
  message: string;
  code?: string | number;
  statusCode?: number;
  originalError?: FetchErrorDetails;
}

/**
 * Custom error class for fetch-related errors.
 */
export class FetchError extends Error {
  /** A specific error code (e.g., ERR_NAVIGATION_TIMEOUT, ERR_HTTP_ERROR). */
  public readonly code?: string;
  /** The original error object, if available. */
  public readonly originalError?: Error;
  /** HTTP status code, if relevant. */
  public readonly statusCode?: number;

  /**
   * Creates an instance of FetchError.
   * @param message The error message.
   * @param code Optional error code string.
   * @param originalError Optional original error.
   * @param statusCode Optional HTTP status code.
   */
  constructor(message: string, code?: string, originalError?: Error, statusCode?: number) {
    super(message);
    this.name = "FetchError";
    this.code = code;
    this.originalError = originalError;
    this.statusCode = statusCode;

    // Maintain proper stack trace for debugging tools while keeping responses clean.
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchError);
    }
  }

  /**
   * Returns a plain object representation with only useful metadata for responses/logging.
   */
  toObject(): FetchErrorDetails {
    const descriptor: FetchErrorDetails = {
      name: this.name,
      message: this.message,
    };

    if (this.code !== undefined) {
      descriptor.code = this.code;
    }

    if (this.statusCode !== undefined) {
      descriptor.statusCode = this.statusCode;
    }

    const original = serializeUnknownError(this.originalError);
    if (original) {
      descriptor.originalError = original;
    }

    return descriptor;
  }

  /**
   * Ensures JSON serialisation exposes only clean error metadata.
   */
  toJSON(): FetchErrorDetails {
    return this.toObject();
  }

  /**
   * Makes console output (`console.error`) display the cleaned error payload without stack noise.
   */
  [inspect.custom](): FetchErrorDetails {
    return this.toObject();
  }
}

function serializeUnknownError(error: unknown): FetchErrorDetails | undefined {
  if (!error) {
    return undefined;
  }

  if (error instanceof FetchError) {
    return error.toObject();
  }

  if (error instanceof Error) {
    const descriptor: FetchErrorDetails = {
      name: error.name || "Error",
      message: error.message,
    };

    const withCode = (error as Error & { code?: unknown }).code;
    if (typeof withCode === "string" || typeof withCode === "number") {
      descriptor.code = withCode;
    }

    const withStatus =
      (error as Error & { statusCode?: unknown; status?: unknown }).statusCode ??
      (error as Error & { status?: unknown }).status;
    if (typeof withStatus === "number") {
      descriptor.statusCode = withStatus;
    }

    const nested = (error as Error & { originalError?: unknown }).originalError;
    const nestedDescriptor = serializeUnknownError(nested);
    if (nestedDescriptor) {
      descriptor.originalError = nestedDescriptor;
    }

    return descriptor;
  }

  if (typeof error === "object") {
    const value = error as Record<string, unknown>;
    const descriptor: FetchErrorDetails = {
      name: typeof value.name === "string" ? value.name : "Error",
      message: typeof value.message === "string" ? value.message : String(error),
    };

    const withCode = value.code;
    if (typeof withCode === "string" || typeof withCode === "number") {
      descriptor.code = withCode;
    }

    const withStatus = (value.statusCode ?? value.status) as unknown;
    if (typeof withStatus === "number") {
      descriptor.statusCode = withStatus;
    }

    const nestedDescriptor = serializeUnknownError(value.originalError);
    if (nestedDescriptor) {
      descriptor.originalError = nestedDescriptor;
    }

    return descriptor;
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : String(error),
  };
}

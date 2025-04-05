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

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchError);
    }
  }
}

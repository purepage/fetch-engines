/**
 * Custom error class for fetch-related errors.
 */
export class FetchError extends Error {
    /** A specific error code (e.g., ERR_NAVIGATION_TIMEOUT, ERR_HTTP_ERROR). */
    code;
    /** The original error object, if available. */
    originalError;
    /** HTTP status code, if relevant. */
    statusCode;
    /**
     * Creates an instance of FetchError.
     * @param message The error message.
     * @param code Optional error code string.
     * @param originalError Optional original error.
     * @param statusCode Optional HTTP status code.
     */
    constructor(message, code, originalError, statusCode) {
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
//# sourceMappingURL=errors.js.map
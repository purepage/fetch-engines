/**
 * Custom error class for fetch-related errors.
 */
export declare class FetchError extends Error {
    /** A specific error code (e.g., ERR_NAVIGATION_TIMEOUT, ERR_HTTP_ERROR). */
    readonly code?: string;
    /** The original error object, if available. */
    readonly originalError?: Error;
    /** HTTP status code, if relevant. */
    readonly statusCode?: number;
    /**
     * Creates an instance of FetchError.
     * @param message The error message.
     * @param code Optional error code string.
     * @param originalError Optional original error.
     * @param statusCode Optional HTTP status code.
     */
    constructor(message: string, code?: string, originalError?: Error, statusCode?: number);
}
//# sourceMappingURL=errors.d.ts.map
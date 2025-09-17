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
    /**
     * Returns a plain object representation with only useful metadata for responses/logging.
     */
    toObject(): FetchErrorDetails;
    /**
     * Ensures JSON serialisation exposes only clean error metadata.
     */
    toJSON(): FetchErrorDetails;
    /**
     * Makes console output (`console.error`) display the cleaned error payload without stack noise.
     */
    [inspect.custom](): FetchErrorDetails;
}
//# sourceMappingURL=errors.d.ts.map
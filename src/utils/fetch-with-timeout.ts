import { FetchError } from "../errors.js";
import { DEFAULT_HTTP_TIMEOUT } from "../constants.js";

/**
 * Fetch with an AbortController-based timeout.
 * Throws FetchError with code ERR_FETCH_TIMEOUT when the timeout elapses.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_HTTP_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    const errorName = typeof error === "object" && error !== null && "name" in error ? String(error.name) : undefined;
    const originalError = error instanceof Error ? error : undefined;

    if (errorName === "AbortError") {
      throw new FetchError(`Fetch timed out after ${timeoutMs}ms`, "ERR_FETCH_TIMEOUT", originalError);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

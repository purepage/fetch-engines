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

export const FETCH_ABORTED_CODE = "ERR_FETCH_ABORTED";
export const ENGINE_DISPOSED_CODE = "ERR_ENGINE_DISPOSED";

export function createFetchAbortedError(originalError?: Error): FetchError {
  return new FetchError("Fetch was aborted", FETCH_ABORTED_CODE, originalError);
}

export function isFetchAbortedError(error: unknown): error is FetchError {
  return error instanceof FetchError && error.code === FETCH_ABORTED_CODE;
}

export function waitForAbortSignal<T>(promise: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject(createFetchAbortedError());

  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener("abort", abort);
      reject(createFetchAbortedError());
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

export function combineAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  const abortSignalConstructor = AbortSignal as typeof AbortSignal & {
    any?: (signals: readonly AbortSignal[]) => AbortSignal;
  };
  if (typeof abortSignalConstructor.any === "function") {
    return abortSignalConstructor.any(signals);
  }

  const controller = new AbortController();
  const abort = (): void => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

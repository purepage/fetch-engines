import type { IEngine } from "./IEngine.js";
import { FetchEngine } from "./FetchEngine.js";
// PlaywrightEngine import removed as it's no longer directly exported or used here
import type { HTMLFetchResult, BrowserMetrics } from "./types.js"; // Import types

export type { IEngine, HTMLFetchResult, BrowserMetrics }; // Export types
export { FetchEngine };
export * from "./HybridEngine.js"; // Export the new engine

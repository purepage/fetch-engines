import type { IEngine } from "./IEngine.js";
import { FetchEngine } from "./FetchEngine.js";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import type { HTMLFetchResult, BrowserMetrics } from "./types.js"; // Import types

export type { IEngine, HTMLFetchResult, BrowserMetrics }; // Export types
export { FetchEngine };
export * from "./HybridEngine.js"; // Export the new engine

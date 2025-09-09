import { defineConfig } from "vitest/config";

const isLive = process.env.LIVE_NETWORK === "1";

export default defineConfig({
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: "jsdom", // Specify JSDOM environment for testing
    testTimeout: 15000, // Increase timeout to 15 seconds
    // Exclude live tests by default; include them when LIVE_NETWORK=1
    exclude: isLive ? [] : ["test/live/**"],
    // reporters: ['verbose'], // Optional: Use verbose reporter for more details
    include: ["test/**/*.test.ts"], // Look for test files in src
    // setupFiles: [], // Optional: files to run before tests
    coverage: {
      provider: "v8", // or 'istanbul'
      reporter: ["text", "json", "html"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

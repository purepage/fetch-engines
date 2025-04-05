import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true, // Use global APIs like describe, it, expect
    environment: "node", // Specify Node.js environment for testing
    testTimeout: 15000, // Increase timeout to 15 seconds
    // reporters: ['verbose'], // Optional: Use verbose reporter for more details
    include: ["src/**/*.test.ts"], // Look for test files in src
    // setupFiles: [], // Optional: files to run before tests
    // coverage: { // Optional: configure coverage
    //   provider: 'v8', // or 'istanbul'
    //   reporter: ['text', 'json', 'html'],
    // },
  },
});

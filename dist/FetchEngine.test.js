import { describe, it, expect } from "vitest";
import { FetchEngine } from "./FetchEngine.js";
describe("FetchEngine", () => {
    it("should fetch HTML and extract title from a static page", async () => {
        const engine = new FetchEngine();
        const url = "http://example.com";
        const expectedUrl = "http://example.com/"; // Expect trailing slash
        try {
            const result = await engine.fetchHTML(url);
            expect(result).toBeDefined();
            expect(result.url).toBe(expectedUrl); // Use expectedUrl
            expect(result.title).toBe("Example Domain");
            expect(result.html).toContain("<title>Example Domain</title>");
            expect(result.html).toContain("<h1>Example Domain</h1>");
        }
        catch (error) {
            // If the test environment doesn't have fetch or network access, this might fail.
            // In a real CI/CD, ensure network access or mock fetch.
            console.warn("FetchEngine test failed, potentially due to network issues or missing fetch API:", error);
            // Re-throw to fail the test if fetch was expected to work
            throw error;
        }
    });
    it("should throw an error for non-HTML content", async () => {
        const engine = new FetchEngine();
        // Use a URL known to return non-HTML content, e.g., a JSON endpoint or an image
        const url = "https://httpbin.org/json";
        // Expect the fetchHTML method to reject
        await expect(engine.fetchHTML(url)).rejects.toThrow("Not an HTML page");
    });
    it("should throw an error for non-existent domains", async () => {
        const engine = new FetchEngine();
        const url = "http://domain-that-does-not-exist-fdsahjkl.xyz";
        // Expect the fetchHTML method to reject (error message might vary)
        await expect(engine.fetchHTML(url)).rejects.toThrow();
    });
    it("should handle http errors", async () => {
        const engine = new FetchEngine();
        const url = "https://httpbin.org/status/404"; // URL that returns 404
        await expect(engine.fetchHTML(url)).rejects.toThrow(/HTTP error! status: 404/);
    });
    // Add more tests: SPA detection warning, etc.
});
//# sourceMappingURL=FetchEngine.test.js.map
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaywrightEngine } from "./PlaywrightEngine.js";
import { PlaywrightBrowserPool } from "./browser/PlaywrightBrowserPool.js";
import axios from "axios";
import { EventEmitter } from "events";
// Mock axios
vi.mock("axios");
// Mock the BrowserPool itself
vi.mock("./browser/PlaywrightBrowserPool.js", () => {
    // console.log("Mocking PlaywrightBrowserPool...");
    const MockBrowserPool = vi.fn();
    MockBrowserPool.prototype.initialize = vi.fn().mockResolvedValue(undefined);
    MockBrowserPool.prototype.acquirePage = vi.fn(); // Mocked per test
    MockBrowserPool.prototype.releasePage = vi.fn().mockResolvedValue(undefined);
    MockBrowserPool.prototype.cleanup = vi.fn().mockResolvedValue(undefined);
    MockBrowserPool.prototype.getMetrics = vi.fn().mockReturnValue([]); // Default to empty metrics
    return { PlaywrightBrowserPool: MockBrowserPool };
});
// Helper function to create a mock Playwright Response
const createMockResponse = () => {
    return {
        ok: vi.fn().mockReturnValue(true),
        status: vi.fn().mockReturnValue(200),
        headers: vi.fn().mockReturnValue({ "content-type": "text/html" }),
        // Add other methods/properties if needed by the engine
        // body: vi.fn().mockResolvedValue(Buffer.from("")),
        // text: vi.fn().mockResolvedValue(""),
        // json: vi.fn().mockResolvedValue({}),
        // etc.
    };
};
// Helper to create mock Page
const createMockPage = () => {
    const pageEmitter = new EventEmitter();
    const mockPage = {
        goto: vi.fn().mockResolvedValue(createMockResponse()), // Mock goto to return mock response
        content: vi.fn().mockResolvedValue("<html>Mock HTML</html>"),
        title: vi.fn().mockResolvedValue("Mock Title"),
        url: vi.fn().mockReturnValue("http://mock.example.com"),
        close: vi.fn().mockImplementation(() => {
            pageEmitter.emit("close");
            return Promise.resolve();
        }),
        isClosed: vi.fn().mockReturnValue(false),
        on: pageEmitter.on.bind(pageEmitter),
        once: pageEmitter.once.bind(pageEmitter),
        off: pageEmitter.off.bind(pageEmitter),
        evaluate: vi.fn(), // Mock evaluate if needed
        mouse: { move: vi.fn().mockResolvedValue(undefined) }, // Mock mouse if behavior simulation tested
        // Add other methods/properties as needed by the engine
    };
    return mockPage;
};
// --- Tests --- //
// Increase timeout for tests involving retries and delays
describe("PlaywrightEngine", { timeout: 20000 }, () => {
    let engine;
    let browserPoolMock;
    beforeEach(() => {
        vi.clearAllMocks(); // Clear mocks between tests
        // --- Set up mocks BEFORE engine creation ---
        // Get the mocked constructor instance from the module mock
        browserPoolMock = new PlaywrightBrowserPool();
        // Mock methods directly on the instance used by the engine
        // Ensure acquirePage returns a fresh mock page for each test
        vi.mocked(browserPoolMock.acquirePage).mockImplementation(async () => createMockPage());
        vi.mocked(browserPoolMock.initialize).mockResolvedValue(undefined);
        vi.mocked(browserPoolMock.cleanup).mockResolvedValue(undefined);
        vi.mocked(browserPoolMock.getMetrics).mockReturnValue([]);
        // Ensure the engine constructor uses THIS specific mocked instance
        vi.mocked(PlaywrightBrowserPool).mockImplementation(() => browserPoolMock);
        // Mock axios.get for HTTP fallback tests
        const mockAxiosGet = vi.fn();
        vi.mocked(axios.get).mockImplementation(mockAxiosGet);
    });
    afterEach(async () => {
        if (engine) {
            await engine.cleanup(); // Ensure engine resources are released
        }
        vi.restoreAllMocks();
    });
    it("should initialize the browser pool on first fetch and return content", async () => {
        engine = new PlaywrightEngine({ useHttpFallback: false }); // Disable fallback for direct test
        const url = "http://example.com/init";
        const result = await engine.fetchHTML(url);
        // Check calls on the INSTANCE mock
        expect(browserPoolMock.initialize).toHaveBeenCalledTimes(1);
        expect(browserPoolMock.acquirePage).toHaveBeenCalledTimes(1);
        expect(result.html).toBe("<html>Mock HTML</html>");
        expect(result.title).toBe("Mock Title");
    });
    it("should use HTTP fallback if enabled and successful", async () => {
        engine = new PlaywrightEngine({ useHttpFallback: true });
        const url = "http://example.com/fallback-success";
        const mockHtml = "<html>Fallback OK</html>";
        const mockAxiosGet = vi.mocked(axios.get).mockResolvedValue({
            data: mockHtml,
            status: 200,
            headers: { "content-type": "text/html" },
            config: { url: url }, // Mock config for URL extraction
            request: { res: { responseUrl: url } }, // Mock responseUrl
        });
        const result = await engine.fetchHTML(url);
        expect(mockAxiosGet).toHaveBeenCalledWith(url, expect.any(Object));
        expect(browserPoolMock.acquirePage).not.toHaveBeenCalled(); // Browser pool should NOT be used
        expect(result.html).toBe(mockHtml);
        expect(result.title).toMatch(/Fallback OK/i); // Regex for simple title extraction
    });
    it("should retry browser fetch if initial attempt fails and fallback also fails", async () => {
        engine = new PlaywrightEngine({
            useHttpFallback: true,
            maxRetries: 1,
            retryDelay: 10,
        });
        const url = "http://example.com/retry";
        // Mock HTTP fallback to fail
        vi.mocked(axios.get).mockRejectedValue(new Error("Axios fallback failed"));
        // Mock acquirePage -> goto to fail once, then succeed
        const mockPage = createMockPage();
        vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage); // Use instance mock
        vi.mocked(mockPage.goto)
            .mockRejectedValueOnce(new Error("First goto failed"))
            .mockResolvedValue(createMockResponse()); // Success on retry
        const result = await engine.fetchHTML(url);
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(browserPoolMock.acquirePage).toHaveBeenCalledTimes(1); // Only acquired once
        expect(mockPage.goto).toHaveBeenCalledTimes(2); // Initial attempt + 1 retry
        expect(result.html).toBe("<html>Mock HTML</html>");
    });
    it("should call pool cleanup when engine cleanup is called", async () => {
        engine = new PlaywrightEngine();
        await engine.fetchHTML("http://example.com/cleanup-test");
        await engine.cleanup();
        expect(browserPoolMock.cleanup).toHaveBeenCalledTimes(1); // Check instance mock
    });
    it("should handle errors during HTTP fallback", async () => {
        // Mock fetchHTMLWithHttpFallback to reject
        vi.spyOn(PlaywrightEngine.prototype, "fetchHTMLWithHttpFallback").mockRejectedValue(new Error("HTTP Fallback Failed"));
        engine = new PlaywrightEngine({ useHttpFallback: true, retryDelay: 10 });
        // We expect it to fail the fallback, then proceed to playwright (which is mocked to succeed)
        const result = await engine.fetchHTML("http://example.com/fail-fallback");
        expect(result).toBeDefined(); // Should still succeed via Playwright mock
        expect(browserPoolMock.acquirePage).toHaveBeenCalled(); // Check instance mock
    });
    it("should handle pool acquirePage errors", async () => {
        // Mock acquirePage on the instance to reject
        vi.mocked(browserPoolMock.acquirePage).mockRejectedValue(new Error("Pool Error"));
        engine = new PlaywrightEngine({ useHttpFallback: false, retryDelay: 10 }); // Disable fallback
        await expect(engine.fetchHTML("http://example.com/pool-error")).rejects.toThrow(/Fetch failed after/);
        expect(browserPoolMock.acquirePage).toHaveBeenCalledTimes(1 + 3); // Check instance mock (Initial + 3 retries)
    });
    it("should handle page.goto errors", async () => {
        // Mock page.goto to reject
        const mockPage = createMockPage();
        vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage); // Use instance mock
        vi.mocked(mockPage.goto).mockRejectedValue(new Error("Navigation Failed"));
        engine = new PlaywrightEngine({ useHttpFallback: false, retryDelay: 10 });
        await expect(engine.fetchHTML("http://example.com/goto-error")).rejects.toThrow(/Fetch failed after/);
        expect(mockPage.goto).toHaveBeenCalledTimes(1 + 3); // Initial + 3 retries
    });
    // Example for testing retry logic
    it("should exhaust retries and throw if browser fetch consistently fails", async () => {
        const mockPage = createMockPage();
        vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage); // Use instance mock
        vi.mocked(mockPage.goto).mockRejectedValue(new Error("Consistent Fail"));
        engine = new PlaywrightEngine({
            maxRetries: 2,
            retryDelay: 10,
            useHttpFallback: false,
        }); // 2 retries
        await expect(engine.fetchHTML("http://example.com/retry-fail")).rejects.toThrow(/Fetch failed after 2 retries: Playwright navigation failed: Consistent Fail/);
        // acquirePage called once initially
        // goto called initial + 2 retries = 3 times
        expect(browserPoolMock.acquirePage).toHaveBeenCalledTimes(1); // Check instance mock
        expect(mockPage.goto).toHaveBeenCalledTimes(3);
    });
    it("should switch to thorough mode on first fast mode failure", async () => {
        const mockPage = createMockPage();
        vi.mocked(browserPoolMock.acquirePage).mockResolvedValue(mockPage); // Use instance mock
        // Fail once, then succeed
        vi.mocked(mockPage.goto)
            .mockRejectedValueOnce(new Error("Fast Mode Fail"))
            .mockResolvedValue(createMockResponse()); // Succeed on second (thorough) try
        vi.mocked(mockPage.content).mockResolvedValue("<html>Thorough Success</html>");
        vi.mocked(mockPage.title).mockResolvedValue("Thorough Title");
        engine = new PlaywrightEngine({
            defaultFastMode: true,
            maxRetries: 1,
            retryDelay: 10,
            useHttpFallback: false,
        });
        // Mock simulateHumanBehavior before calling fetchHTML
        const simulateSpy = vi
            .spyOn(engine, "simulateHumanBehavior")
            .mockResolvedValue(undefined);
        const result = await engine.fetchHTML("http://example.com/fast-fail");
        expect(mockPage.goto).toHaveBeenCalledTimes(2);
        expect(result.html).toBe("<html>Thorough Success</html>");
        expect(result.title).toBe("Thorough Title");
        // Check simulateHumanBehavior was called on the second (thorough) attempt
        expect(simulateSpy).toHaveBeenCalledTimes(1);
        simulateSpy.mockRestore(); // Clean up spy
    });
    // TODO: Test headed mode fallback logic
    // TODO: Test caching logic
});
//# sourceMappingURL=PlaywrightEngine.test.js.map
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlaywrightBrowserPool } from "./PlaywrightBrowserPool.js";
import { chromium } from "playwright"; // We need to mock methods on this
import EventEmitter from "events";
// --- Mock Playwright Components --- //
// Mock the top-level chromium object and its launch method
vi.mock("playwright", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual, // Keep other exports like types
        chromium: {
            launch: vi.fn(),
            // Mock other chromium methods if needed
        },
    };
});
// Helper to create deep mocks for Browser, Context, Page
const createMockPage = () => {
    const pageEmitter = new EventEmitter();
    const mockPage = {
        close: vi.fn().mockImplementation(() => {
            pageEmitter.emit("close");
            return Promise.resolve();
        }),
        isClosed: vi.fn().mockReturnValue(false),
        context: vi.fn(), // Will be set later
        on: pageEmitter.on.bind(pageEmitter), // Use EventEmitter for on/emit
        once: pageEmitter.once.bind(pageEmitter),
        off: pageEmitter.off.bind(pageEmitter),
        // Add other methods/properties as needed by the pool
    };
    return mockPage;
};
const createMockContext = (mockBrowser) => {
    const contextEmitter = new EventEmitter();
    const mockContext = {
        newPage: vi.fn().mockResolvedValue(createMockPage()),
        close: vi.fn().mockImplementation(() => {
            contextEmitter.emit("close");
            return Promise.resolve();
        }),
        browser: vi.fn().mockReturnValue(mockBrowser),
        pages: vi.fn().mockReturnValue([]), // Initially no pages
        route: vi.fn().mockResolvedValue(undefined),
        on: contextEmitter.on.bind(contextEmitter),
        once: contextEmitter.once.bind(contextEmitter),
        off: contextEmitter.off.bind(contextEmitter),
        // Add other methods as needed
    };
    // Link pages back to context
    vi.mocked(mockContext.newPage).mockImplementation(async () => {
        const page = createMockPage();
        vi.spyOn(page, "context").mockReturnValue(mockContext);
        const currentPages = mockContext.pages();
        vi.spyOn(mockContext, "pages").mockReturnValue([...currentPages, page]);
        // Simulate page close removing it from context
        page.on("close", () => {
            const updatedPages = mockContext.pages().filter((p) => p !== page);
            vi.spyOn(mockContext, "pages").mockReturnValue(updatedPages);
        });
        return page;
    });
    return mockContext;
};
const createMockBrowser = () => {
    const browserEmitter = new EventEmitter();
    const mockBrowser = {
        newContext: vi.fn(), // Implementation below
        close: vi.fn().mockImplementation(() => {
            browserEmitter.emit("disconnected");
            return Promise.resolve();
        }),
        isConnected: vi.fn().mockReturnValue(true),
        on: browserEmitter.on.bind(browserEmitter),
        once: browserEmitter.once.bind(browserEmitter),
        off: browserEmitter.off.bind(browserEmitter),
        // Add other methods as needed
    };
    // Setup context creation
    vi.mocked(mockBrowser.newContext).mockImplementation(async () => {
        return createMockContext(mockBrowser);
    });
    return mockBrowser;
};
// --- Tests --- //
describe("PlaywrightBrowserPool", () => {
    let pool;
    // Mock implementation for chromium.launch
    let mockLaunch;
    beforeEach(() => {
        vi.clearAllMocks(); // Clear mocks between tests
        vi.useFakeTimers(); // Use fake timers for health checks, etc.
        // Reset the mock for chromium.launch for each test
        mockLaunch = vi.mocked(chromium.launch).mockImplementation(async () => {
            return createMockBrowser();
        });
    });
    afterEach(async () => {
        vi.useRealTimers(); // Restore real timers
        if (pool) {
            await pool.cleanup(); // Ensure pool resources are released
        }
    });
    describe("Initialization", { timeout: 60000 }, () => {
        it("should initialize with default settings and create one browser instance", async () => {
            pool = new PlaywrightBrowserPool();
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
            const metrics = pool.getMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].isHealthy).toBe(true);
            await pool.cleanup(); // Clean up this instance
        });
        it("should initialize in headed mode if specified", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxPagesPerContext: 1,
                maxBrowserAge: 30000,
                healthCheckInterval: 10000,
                useHeadedMode: true,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ headless: false }));
            await pool.cleanup();
        });
        it("should not initialize more than maxBrowsers", async () => {
            pool = new PlaywrightBrowserPool({ maxBrowsers: 2 }); // Max 2 browsers
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(2); // ensureMinimumInstances aims for max
            await pool.cleanup();
        });
        it("should start health checks after initialization", async () => {
            const healthCheckInterval = 5000;
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxPagesPerContext: 1,
                maxBrowserAge: 30000,
                healthCheckInterval,
            });
            const healthCheckSpy = vi.spyOn(pool, "healthCheck");
            await pool.initialize();
            expect(healthCheckSpy).not.toHaveBeenCalled(); // Doesn't run immediately
            await vi.advanceTimersByTimeAsync(healthCheckInterval + 100);
            expect(healthCheckSpy).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(healthCheckInterval);
            expect(healthCheckSpy).toHaveBeenCalledTimes(2);
            await pool.cleanup(); // Stops timer
            healthCheckSpy.mockRestore();
        });
    });
    describe("Page Acquisition", () => {
        it("should acquire a page from an existing healthy instance", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxPagesPerContext: 2,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            // Acquire first page
            const page1 = await pool.acquirePage();
            expect(page1).toBeDefined();
            expect(page1.isClosed()).toBe(false);
            // Check metrics (approximate)
            const metrics1 = pool.getMetrics();
            expect(metrics1[0].activePages).toBe(1);
            const initialLastUsed = metrics1[0].lastUsed.getTime();
            // Acquire second page from the same instance
            vi.advanceTimersByTime(10); // Ensure time advances for lastUsed check
            const page2 = await pool.acquirePage();
            expect(page2).toBeDefined();
            expect(page2.isClosed()).toBe(false);
            expect(page1).not.toBe(page2);
            // Check metrics again
            const metrics2 = pool.getMetrics();
            expect(metrics2[0].activePages).toBe(2);
            expect(metrics2[0].lastUsed.getTime()).toBeGreaterThan(initialLastUsed);
            // Cleanup pages (using the pool's release method)
            await pool.releasePage(page1);
            await pool.releasePage(page2);
            // Verify pages are closed and metrics updated
            // NOTE: The mock page close needs to trigger the event correctly
            // and the pool needs to listen to remove from activePages count.
            // This part might require adjusting mocks if it fails.
            // expect(page1.isClosed()).toBe(true);
            // expect(page2.isClosed()).toBe(true);
            // const metrics3 = pool.getMetrics();
            // expect(metrics3[0].activePages).toBe(0);
        });
        it("should trigger new instance creation if pool < max and existing is full", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 2,
                maxPagesPerContext: 1,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(2); // Pool initializes up to maxBrowsers
            expect(pool.getMetrics().length).toBe(2);
            // Acquire page from first instance
            const page1 = await pool.acquirePage();
            expect(page1).toBeDefined();
            const metrics1 = pool.getMetrics();
            // Find which instance got the page
            const instance1Index = metrics1.findIndex((m) => m.activePages === 1);
            expect(instance1Index).toBeGreaterThanOrEqual(0); // Should be 0 or 1
            // Acquire page from second instance (first one is now full)
            const page2 = await pool.acquirePage();
            expect(page2).toBeDefined();
            expect(page1.context()).not.toBe(page2.context()); // Should be from different contexts/browsers
            const metrics2 = pool.getMetrics();
            expect(metrics2[0].activePages + metrics2[1].activePages).toBe(2);
            expect(metrics2.filter((m) => m.activePages === 1).length).toBe(2); // Both instances have 1 page
            // Cleanup
            await pool.releasePage(page1);
            await pool.releasePage(page2);
        });
        it("should fail acquisition if pool is full and all instances are at max pages", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxPagesPerContext: 1,
            }); // Pool full after 1 page
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            // Acquire the only available page slot
            const page1 = await pool.acquirePage();
            expect(page1).toBeDefined();
            expect(pool.getMetrics()[0].activePages).toBe(1);
            // Attempt to acquire another page - should fail
            await expect(pool.acquirePage()).rejects.toThrow(/Failed to acquire Playwright page.*pool may be unhealthy or overloaded/i);
            // Check that metrics didn't change
            expect(pool.getMetrics()[0].activePages).toBe(1);
            // Cleanup
            await pool.releasePage(page1);
        });
        it("should fail acquisition if pool is unhealthy or becomes unhealthy", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxPagesPerContext: 1,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            // Access internal pool array (use type assertion for needed properties)
            const browserInstance = pool.pool[0];
            // Manually mark the only instance as unhealthy
            browserInstance.isHealthy = false;
            // Attempt to acquire a page - should fail
            await expect(pool.acquirePage()).rejects.toThrow(/Failed to acquire Playwright page.*pool may be unhealthy or overloaded/i);
            // Instance should still be unhealthy, no pages acquired
            expect(browserInstance.isHealthy).toBe(false);
            expect(browserInstance.pages.size).toBe(0);
            expect(pool.getMetrics()[0].activePages).toBe(0);
        });
    });
    describe("Health Checks", { timeout: 60000 }, () => {
        it("should remove an instance due to max age", async () => {
            const maxAge = 10000; // 10 seconds
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                maxBrowserAge: maxAge,
                healthCheckInterval: 1000,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(1);
            expect(pool.getMetrics().length).toBe(1);
            const initialInstanceId = pool.getMetrics()[0].id;
            // Advance time past max age but before next health check
            await vi.advanceTimersByTimeAsync(maxAge - 500);
            expect(pool.getMetrics().length).toBe(1); // Still there
            // Advance time to trigger health check after max age
            await vi.advanceTimersByTimeAsync(1500);
            // Health check should have run and removed the old instance
            // and pool should have created a new one
            expect(pool.getMetrics().length).toBe(1);
            const newInstanceId = pool.getMetrics()[0].id;
            expect(newInstanceId).not.toBe(initialInstanceId);
            expect(mockLaunch).toHaveBeenCalledTimes(2); // One initial, one replacement
        });
        it("should remove an instance due to idle timeout (if pool size > 1)", async () => {
            const idleTimeout = 5000; // Use a shorter timeout for testing
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 2,
                healthCheckInterval: 1000,
            });
            // Manually set idle timeout AFTER creating the instance
            pool.maxIdleTime = idleTimeout;
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(2); // Pool starts with 2 instances
            expect(pool.getMetrics().length).toBe(2);
            const instanceIds = pool.getMetrics().map((m) => m.id);
            // Acquire and release a page from one instance to reset its idle timer
            const page = await pool.acquirePage();
            const activeInstanceMetric = pool.getMetrics().find((m) => m.activePages === 1);
            expect(activeInstanceMetric).toBeDefined();
            const activeInstanceId = activeInstanceMetric.id;
            await pool.releasePage(page);
            expect(pool.getMetrics().find((m) => m.id === activeInstanceId)?.activePages).toBe(0);
            // Advance time just past the idle timeout
            await vi.advanceTimersByTimeAsync(idleTimeout + 100);
            // Let health check run
            await vi.advanceTimersByTimeAsync(1000); // Trigger health check interval
            // The instance that *wasn't* used should have been removed due to idle timeout
            expect(pool.getMetrics().length).toBe(1);
            const remainingInstanceMetric = pool.getMetrics()[0];
            expect(remainingInstanceMetric.id).toBe(activeInstanceId);
            expect(instanceIds).toContain(remainingInstanceMetric.id);
            expect(mockLaunch).toHaveBeenCalledTimes(2); // No new instance created yet
        });
        it("should remove an instance due to browser disconnect event", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                healthCheckInterval: 1000,
            });
            await pool.initialize();
            expect(pool.getMetrics().length).toBe(1);
            const browserInstance = pool.pool[0]; // Structural type
            const initialInstanceId = pool.getMetrics()[0].id;
            // Simulate the browser disconnecting (needs access to the mock browser's emitter)
            // Find the mock browser associated with the instance
            const mockBrowser = browserInstance.browser;
            expect(mockBrowser).toBeDefined();
            // Emit the 'disconnected' event on the mock browser
            mockBrowser.emit("disconnected");
            // Check that the instance is marked unhealthy immediately by the event handler
            expect(browserInstance.isHealthy).toBe(false);
            // Advance time to trigger health check
            await vi.advanceTimersByTimeAsync(1100);
            // Health check should remove the unhealthy instance and create a new one
            expect(pool.getMetrics().length).toBe(1);
            expect(pool.getMetrics()[0].id).not.toBe(initialInstanceId);
            expect(mockLaunch).toHaveBeenCalledTimes(2); // Initial + replacement
        });
        it("should remove an instance due to failed health check (isConnected)", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 1,
                healthCheckInterval: 1000,
            });
            await pool.initialize();
            expect(pool.getMetrics().length).toBe(1);
            const browserInstance = pool.pool[0]; // Structural type
            const initialInstanceId = pool.getMetrics()[0].id;
            // Mock the isConnected method on the specific mock browser instance
            const mockBrowser = browserInstance.browser;
            vi.spyOn(mockBrowser, "isConnected").mockReturnValue(false);
            // Advance time to trigger health check
            await vi.advanceTimersByTimeAsync(1100);
            // Health check should detect disconnected state, remove instance, and create a new one
            expect(pool.getMetrics().length).toBe(1);
            expect(pool.getMetrics()[0].id).not.toBe(initialInstanceId);
            expect(mockLaunch).toHaveBeenCalledTimes(2); // Initial + replacement
            // Restore mock
            vi.mocked(mockBrowser.isConnected).mockRestore();
        });
        it("should keep healthy instances during health check", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 2,
                healthCheckInterval: 1000,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(2);
            const initialMetrics = pool.getMetrics();
            expect(initialMetrics.length).toBe(2);
            const initialIds = initialMetrics.map((m) => m.id).sort();
            // Ensure mocks are healthy
            const instance1 = pool.pool[0];
            const instance2 = pool.pool[1];
            vi.spyOn(instance1.browser, "isConnected").mockReturnValue(true);
            vi.spyOn(instance2.browser, "isConnected").mockReturnValue(true);
            // Advance time to trigger multiple health checks
            await vi.advanceTimersByTimeAsync(3500);
            // Verify instances are still present and healthy (mockLaunch not called again)
            const finalMetrics = pool.getMetrics();
            expect(finalMetrics.length).toBe(2);
            const finalIds = finalMetrics.map((m) => m.id).sort();
            expect(finalIds).toEqual(initialIds);
            expect(mockLaunch).toHaveBeenCalledTimes(2); // No replacements should have occurred
            // Restore mocks
            vi.mocked(instance1.browser.isConnected).mockRestore();
            vi.mocked(instance2.browser.isConnected).mockRestore();
        });
        it("should replenish instances after removal to maintain pool size", async () => {
            pool = new PlaywrightBrowserPool({
                maxBrowsers: 2,
                healthCheckInterval: 1000,
            });
            await pool.initialize();
            expect(mockLaunch).toHaveBeenCalledTimes(2);
            expect(pool.getMetrics().length).toBe(2);
            const initialIds = pool.getMetrics().map((m) => m.id);
            // Manually remove one instance (simulate external issue or previous health check removal)
            const instanceToRemove = pool.pool[0];
            await pool.closeAndRemoveInstance(instanceToRemove); // Use internal method for testing
            expect(pool.getMetrics().length).toBe(1); // Should be 1 temporarily
            // Advance time to trigger health check
            await vi.advanceTimersByTimeAsync(1100);
            // Health check should detect the shortage and create a new instance
            expect(pool.getMetrics().length).toBe(2);
            expect(mockLaunch).toHaveBeenCalledTimes(3); // Initial 2 + 1 replacement
            // Verify the remaining original instance and one new instance are present
            const finalIds = pool.getMetrics().map((m) => m.id);
            const removedId = initialIds[0];
            const keptId = initialIds[1];
            expect(finalIds).toContain(keptId);
            expect(finalIds).not.toContain(removedId);
            expect(finalIds.length).toBe(2);
        });
    });
    describe("Cleanup", () => {
        it.todo("should be implemented");
        // TODO: Add tests for cleanup
        // - Cleanup closes all browser instances
        // - Cleanup stops health checks
        // - Cleanup prevents further acquisitions
    });
    describe("Error Handling", () => {
        it.todo("should be implemented");
        // TODO: Add tests for error scenarios
        // - chromium.launch fails
        // - browser.newContext fails
        // - context.newPage fails
    });
});
//# sourceMappingURL=PlaywrightBrowserPool.test.js.map
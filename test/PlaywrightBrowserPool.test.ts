import { beforeEach, describe, expect, it, vi } from "vitest";
import { access } from "node:fs/promises";

const mocks = vi.hoisted(() => {
  const page = {
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
    on: vi.fn(),
    route: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue("about:blank"),
  };
  const context = {
    browser: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    newPage: vi.fn().mockResolvedValue(page),
    pages: vi.fn().mockReturnValue([page]),
    route: vi.fn().mockResolvedValue(undefined),
  };
  const browser = {
    close: vi.fn().mockResolvedValue(undefined),
    contexts: vi.fn().mockReturnValue([context]),
    isConnected: vi.fn().mockReturnValue(true),
    newContext: vi.fn().mockResolvedValue(context),
    off: vi.fn(),
    on: vi.fn(),
  };
  context.browser.mockReturnValue(browser);
  return {
    browser,
    connectOverCDP: vi.fn().mockResolvedValue(browser),
    context,
    launch: vi.fn(),
    patchrightLaunch: vi.fn().mockResolvedValue(browser),
    patchrightLaunchPersistentContext: vi.fn().mockResolvedValue(context),
    page,
  };
});

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: mocks.connectOverCDP,
    launch: mocks.launch,
  },
}));

vi.mock("patchright", () => ({
  chromium: {
    connectOverCDP: mocks.connectOverCDP,
    launch: mocks.patchrightLaunch,
    launchPersistentContext: mocks.patchrightLaunchPersistentContext,
  },
}));

vi.mock("playwright-extra", () => ({
  addExtra: vi.fn(() => ({
    launch: mocks.launch,
    use: vi.fn(),
  })),
}));

vi.mock("puppeteer-extra-plugin-stealth", () => ({
  default: vi.fn(() => ({})),
}));

import { PlaywrightBrowserPool } from "../src/browser/PlaywrightBrowserPool";

describe("PlaywrightBrowserPool CDP connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.browser.contexts.mockReturnValue([mocks.context]);
    mocks.browser.isConnected.mockReturnValue(true);
    mocks.context.pages.mockReturnValue([mocks.page]);
    mocks.page.isClosed.mockReturnValue(false);
    mocks.page.url.mockReturnValue("about:blank");
    mocks.patchrightLaunch.mockResolvedValue(mocks.browser);
    mocks.patchrightLaunchPersistentContext.mockResolvedValue(mocks.context);
  });

  it("should attach to the existing default context instead of launching a browser", async () => {
    const cdpEndpoint = "http://127.0.0.1:9222";
    const cdpConnectionOptions = { headers: { Authorization: "Bearer test" }, timeout: 12_345 };
    const pool = new PlaywrightBrowserPool({
      maxBrowsers: 1,
      healthCheckInterval: 0,
      cdpEndpoint,
      cdpConnectionOptions,
    } as any);

    await pool.initialize();
    const page = await pool.acquirePage();
    await pool.releasePage(page);
    await pool.cleanup();

    expect(mocks.connectOverCDP).toHaveBeenCalledWith(cdpEndpoint, cdpConnectionOptions);
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.context.newPage).not.toHaveBeenCalled();
    expect(mocks.context.close).not.toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalledTimes(1);
    expect(mocks.context.route).toHaveBeenCalledWith("**/*", expect.any(Function));
  });

  it("should force a single browser connection when CDP is configured", async () => {
    const pool = new PlaywrightBrowserPool({
      healthCheckInterval: 0,
      cdpEndpoint: "http://127.0.0.1:9222",
    });

    await pool.initialize();
    await pool.cleanup();

    expect(mocks.connectOverCDP).toHaveBeenCalledTimes(1);
  });

  it("should leave existing non-blank CDP pages untouched", async () => {
    const externalPage = {
      close: vi.fn().mockResolvedValue(undefined),
      isClosed: vi.fn().mockReturnValue(false),
      url: vi.fn().mockReturnValue("https://example.com/already-open"),
    };
    mocks.context.pages.mockReturnValue([externalPage as any]);
    const pool = new PlaywrightBrowserPool({
      maxBrowsers: 1,
      healthCheckInterval: 0,
      cdpEndpoint: "http://127.0.0.1:9222",
    } as any);

    await pool.initialize();
    const enginePage = await pool.acquirePage();
    await pool.releasePage(enginePage);
    await pool.cleanup();

    expect(mocks.context.newPage).toHaveBeenCalledTimes(1);
    expect(mocks.page.close).toHaveBeenCalledTimes(1);
    expect(externalPage.close).not.toHaveBeenCalled();
  });

  it("should reject a CDP browser with no default context without creating one", async () => {
    mocks.browser.contexts.mockReturnValue([]);
    const pool = new PlaywrightBrowserPool({
      maxBrowsers: 1,
      healthCheckInterval: 0,
      cdpEndpoint: "ws://browser.example/devtools/browser/test",
    } as any);

    await expect(pool.initialize()).rejects.toThrow("did not expose a default context");

    expect(mocks.browser.newContext).not.toHaveBeenCalled();
    expect(mocks.context.close).not.toHaveBeenCalled();
    expect(mocks.browser.close).toHaveBeenCalledTimes(1);
  });

  it("should launch Patchright with a persistent native-viewport context", async () => {
    const pool = new PlaywrightBrowserPool({
      browserDriver: "patchright",
      healthCheckInterval: 0,
      launchOptions: {
        executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      },
      maxBrowsers: 1,
      useHeadedMode: true,
    });

    await pool.initialize();
    await pool.cleanup();

    expect(mocks.patchrightLaunchPersistentContext).toHaveBeenCalledWith(
      expect.stringContaining("purepage-patchright-"),
      expect.objectContaining({
        executablePath: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        headless: false,
        viewport: null,
        ignoreHTTPSErrors: true,
      })
    );
    expect(mocks.patchrightLaunch).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(mocks.context.route).not.toHaveBeenCalled();
  });

  it.each(["browser disconnect", "page crash"] as const)(
    "should close a failed Patchright instance before creating its replacement after %s",
    async (failure) => {
      const events: string[] = [];
      let releaseClose!: () => void;
      const closeGate = new Promise<void>((resolve) => {
        releaseClose = resolve;
      });

      mocks.patchrightLaunchPersistentContext
        .mockImplementationOnce(async () => {
          events.push("launch-first");
          return mocks.context;
        })
        .mockImplementationOnce(async () => {
          events.push("launch-replacement");
          return mocks.context;
        });
      mocks.context.close.mockImplementationOnce(async () => {
        events.push("close-first");
        await closeGate;
      });

      const pool = new PlaywrightBrowserPool({
        browserDriver: "patchright",
        healthCheckInterval: 0,
        maxBrowsers: 1,
      });

      await pool.initialize();
      const firstProfile = mocks.patchrightLaunchPersistentContext.mock.calls[0][0] as string;

      if (failure === "browser disconnect") {
        const disconnectedHandler = mocks.browser.on.mock.calls.find(
          ([event]) => event === "disconnected"
        )?.[1] as (() => void) | undefined;
        expect(disconnectedHandler).toBeDefined();
        disconnectedHandler?.();
      } else {
        await pool.acquirePage();
        const crashHandler = mocks.page.on.mock.calls.find(([event]) => event === "crash")?.[1] as
          | (() => void)
          | undefined;
        expect(crashHandler).toBeDefined();
        crashHandler?.();
      }

      await vi.waitFor(() => expect(mocks.patchrightLaunchPersistentContext).toHaveBeenCalledTimes(1));
      releaseClose();
      await vi.waitFor(() => expect(mocks.patchrightLaunchPersistentContext).toHaveBeenCalledTimes(2));

      expect(events.indexOf("close-first")).toBeGreaterThanOrEqual(0);
      expect(events.indexOf("launch-replacement")).toBeGreaterThan(events.indexOf("close-first"));
      await expect(access(firstProfile)).rejects.toThrow();

      await pool.cleanup();
    }
  );

  it("should close only the persistent context during Patchright cleanup", async () => {
    const pool = new PlaywrightBrowserPool({
      browserDriver: "patchright",
      healthCheckInterval: 0,
      maxBrowsers: 1,
    });

    await pool.initialize();
    await pool.cleanup();

    expect(mocks.context.close).toHaveBeenCalledTimes(1);
    expect(mocks.browser.close).not.toHaveBeenCalled();
  });

  it("should close the browser when persistent-context cleanup fails", async () => {
    mocks.context.close.mockRejectedValueOnce(new Error("context close failed"));
    const pool = new PlaywrightBrowserPool({
      browserDriver: "patchright",
      healthCheckInterval: 0,
      maxBrowsers: 1,
    });

    await pool.initialize();
    await pool.cleanup();

    expect(mocks.context.close).toHaveBeenCalledTimes(1);
    expect(mocks.browser.close).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLaunch = vi.fn();
const mockUse = vi.fn();
const mockAddExtra = vi.fn(() => ({
  launch: mockLaunch,
  use: mockUse.mockReturnThis(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: mockLaunch,
  },
}));

vi.mock("playwright-extra", () => ({
  addExtra: mockAddExtra,
}));

vi.mock("puppeteer-extra-plugin-stealth", () => ({
  default: vi.fn(() => ({ name: "stealth-plugin" })),
}));

vi.mock("p-queue", () => ({
  default: vi.fn().mockImplementation(() => ({
    add: vi.fn((task: () => Promise<unknown>) => task()),
    onIdle: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    size: 0,
    pending: 0,
  })),
}));

vi.mock("user-agents", () => ({
  default: vi.fn().mockImplementation(() => ({
    toString: () => "MockUA/1.0",
  })),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "pool-browser-id"),
}));

describe("PlaywrightBrowserPool", () => {
  let mockContext: {
    route: ReturnType<typeof vi.fn>;
    grantPermissions: ReturnType<typeof vi.fn>;
    addInitScript: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let mockBrowser: {
    newContext: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    isConnected: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      route: vi.fn().mockResolvedValue(undefined),
      grantPermissions: vi.fn().mockResolvedValue(undefined),
      addInitScript: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      on: vi.fn(),
      off: vi.fn(),
      isConnected: vi.fn(() => true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockLaunch.mockResolvedValue(mockBrowser);
  });

  it("should apply browserProfile settings when creating a browser context", async () => {
    const { PlaywrightBrowserPool } = await import("../src/browser/PlaywrightBrowserPool");
    const browserProfile = {
      userAgent: "CustomUA/99.0",
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      geolocation: { latitude: 40.7128, longitude: -74.006, accuracy: 50 },
      permissions: ["geolocation"] as const,
      initScripts: [{ content: "window.__FETCH_ENGINES__ = true;" }],
    };

    const pool = new PlaywrightBrowserPool({
      maxBrowsers: 1,
      healthCheckInterval: 0,
      browserProfile,
    });

    await pool.initialize();

    expect(mockAddExtra).toHaveBeenCalled();
    expect(mockUse).toHaveBeenCalled();
    expect(mockLaunch).toHaveBeenCalled();
    expect(mockBrowser.newContext).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: "CustomUA/99.0",
        viewport: { width: 1440, height: 900 },
        locale: "en-US",
        timezoneId: "America/New_York",
        geolocation: { latitude: 40.7128, longitude: -74.006, accuracy: 50 },
        ignoreHTTPSErrors: true,
      })
    );
    expect(mockContext.grantPermissions).toHaveBeenCalledWith(["geolocation"]);
    expect(mockContext.addInitScript).toHaveBeenCalledWith({
      content: "window.__FETCH_ENGINES__ = true;",
    });

    await pool.cleanup();
  });
});

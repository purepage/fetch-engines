import type { Browser, BrowserContext, BrowserServer, Page } from "playwright";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManagedBrowserInstance, PlaywrightBrowserPool } from "../src/browser/PlaywrightBrowserPool";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ManagedBrowserInstance cleanup", () => {
  it("terminates the owned browser process tree when graceful shutdown exceeds its deadline", async () => {
    const browserProcess = {
      exitCode: null as number | null,
      signalCode: null as NodeJS.Signals | null,
    };
    const browserServer = {
      close: vi.fn(() => new Promise<void>(() => undefined)),
      kill: vi.fn(async () => {
        browserProcess.signalCode = "SIGKILL";
      }),
      process: vi.fn(() => browserProcess),
    } as unknown as BrowserServer;
    const browser = {
      off: vi.fn(),
      close: vi.fn(() => new Promise<void>(() => undefined)),
    } as unknown as Browser;
    const context = {
      close: vi.fn(() => new Promise<void>(() => undefined)),
    } as unknown as BrowserContext;

    const instance = new ManagedBrowserInstance({
      useHeadedMode: false,
      blockedDomains: [],
      blockedResourceTypes: [],
      onDisconnect: vi.fn(),
      closeTimeout: 5,
    });
    instance.browser = browser;
    instance.context = context;
    Reflect.set(instance, "browserServer", browserServer);

    const firstClose = instance.close("test timeout");
    const secondClose = instance.close("duplicate cleanup");

    expect(secondClose).toBe(firstClose);
    await firstClose;

    expect(browserServer.kill).toHaveBeenCalledTimes(1);
    expect(browserProcess.signalCode).toBe("SIGKILL");
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("does not mark a healthy browser unhealthy when page creation is cancelled", async () => {
    const pageCreation = deferred<Page>();
    const latePage = {
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    } as unknown as Page;
    const onDisconnect = vi.fn();
    const instance = new ManagedBrowserInstance({
      useHeadedMode: false,
      blockedDomains: [],
      blockedResourceTypes: [],
      onDisconnect,
      closeTimeout: 5,
    });
    instance.context = {
      newPage: vi.fn(() => pageCreation.promise),
    } as unknown as BrowserContext;
    const controller = new AbortController();

    const acquisition = instance.acquirePage(controller.signal);
    controller.abort();

    await expect(acquisition).rejects.toMatchObject({ code: "ERR_FETCH_ABORTED" });
    expect(instance.isHealthy).toBe(true);
    expect(onDisconnect).not.toHaveBeenCalled();

    pageCreation.resolve(latePage);
    await vi.waitFor(() => expect(latePage.close).toHaveBeenCalledTimes(1));
  });
});

describe("PlaywrightBrowserPool lifecycle", () => {
  it("keeps cleanup idempotent and rejects acquisition after shutdown", async () => {
    const pool = new PlaywrightBrowserPool({ maxBrowsers: 1 });
    const firstCleanup = pool.cleanup();
    const secondCleanup = pool.cleanup();

    expect(secondCleanup).toBe(firstCleanup);
    await firstCleanup;

    await expect(pool.acquirePage()).rejects.toThrow("Pool is shutting down.");
  });

  it("removes an aborted acquisition before its queued callback starts", async () => {
    type PoolInternals = { pool: Set<ManagedBrowserInstance> };
    const pool = new PlaywrightBrowserPool({ maxBrowsers: 1, healthCheckInterval: 0 });
    const instance = new ManagedBrowserInstance({
      useHeadedMode: false,
      blockedDomains: [],
      blockedResourceTypes: [],
      onDisconnect: vi.fn(),
      closeTimeout: 5,
    });
    const firstPage = deferred<Page>();
    const acquirePage = vi.spyOn(instance, "acquirePage").mockReturnValue(firstPage.promise);
    vi.spyOn(instance, "canCreateMorePages").mockReturnValue(true);
    (pool as unknown as PoolInternals).pool.add(instance);

    const firstAcquisition = pool.acquirePage();
    await vi.waitFor(() => expect(acquirePage).toHaveBeenCalledTimes(1));

    const controller = new AbortController();
    const queuedAcquisition = pool.acquirePage(controller.signal);
    controller.abort();

    await expect(queuedAcquisition).rejects.toMatchObject({ code: "ERR_FETCH_ABORTED" });
    expect(acquirePage).toHaveBeenCalledTimes(1);

    const page = { isClosed: vi.fn(() => true) } as unknown as Page;
    firstPage.resolve(page);
    await expect(firstAcquisition).resolves.toBe(page);
    await pool.cleanup();
  });

  it("does not initialize a replacement pool until an in-flight creation is closed", async () => {
    type PoolInternals = {
      ensureMinimumInstances: () => Promise<void>;
      pendingCreations: Map<ManagedBrowserInstance, Promise<ManagedBrowserInstance>>;
    };

    const oldPool = new PlaywrightBrowserPool({ maxBrowsers: 1, healthCheckInterval: 0 });
    const pendingInstance = new ManagedBrowserInstance({
      useHeadedMode: false,
      blockedDomains: [],
      blockedResourceTypes: [],
      onDisconnect: vi.fn(),
      closeTimeout: 5,
    });
    const creation = deferred<ManagedBrowserInstance>();
    const closing = deferred<void>();
    vi.spyOn(pendingInstance, "close").mockReturnValue(closing.promise);
    (oldPool as unknown as PoolInternals).pendingCreations.set(pendingInstance, creation.promise);

    const cleanup = oldPool.cleanup();
    await vi.waitFor(() => expect(pendingInstance.close).toHaveBeenCalledTimes(1));

    const replacementPool = new PlaywrightBrowserPool({ maxBrowsers: 1, healthCheckInterval: 0 });
    const ensureMinimumInstances = vi
      .spyOn(replacementPool as unknown as PoolInternals, "ensureMinimumInstances")
      .mockResolvedValue(undefined);
    const replacementInitialization = replacementPool.initialize();

    await Promise.resolve();
    expect(ensureMinimumInstances).not.toHaveBeenCalled();

    creation.resolve(pendingInstance);
    closing.resolve();
    await cleanup;
    await replacementInitialization;

    expect(ensureMinimumInstances).toHaveBeenCalledTimes(1);
    await replacementPool.cleanup();
  });
});

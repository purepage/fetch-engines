import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

async function firstAvailableExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next browser candidate.
    }
  }
  return chromium.executablePath();
}

const externalEndpoint = process.env.LIVE_CDP_ENDPOINT?.trim();
const browserExecutable = await firstAvailableExecutable([
  process.env.LIVE_BROWSER_EXECUTABLE,
  process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : undefined,
  process.platform === "linux" ? "/usr/bin/google-chrome-stable" : undefined,
  process.platform === "linux" ? "/usr/bin/google-chrome" : undefined,
]);
const vitestModule = path.resolve("node_modules", "vitest", "vitest.mjs");
const forwardedArguments = process.argv.slice(2);
if (forwardedArguments[0] === "--") {
  forwardedArguments.shift();
}
const vitestArguments = ["run", "--environment", "node", "test/live/LiveNetwork.test.ts", ...forwardedArguments];
const command = process.platform === "linux" ? "xvfb-run" : process.execPath;
const commandArguments =
  process.platform === "linux"
    ? ["--auto-servernum", process.execPath, vitestModule, ...vitestArguments]
    : [vitestModule, ...vitestArguments];
const testProcess = spawn(command, commandArguments, {
  env: {
    ...process.env,
    LIVE_BROWSER_EXECUTABLE: browserExecutable,
    LIVE_CDP_ENDPOINT: externalEndpoint || "",
    LIVE_NETWORK: "1",
  },
  stdio: "inherit",
});
const testExitCode = await new Promise((resolve, reject) => {
  testProcess.once("error", reject);
  testProcess.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`Live smoke tests exited with signal ${signal}.`));
    } else {
      resolve(code ?? 1);
    }
  });
});
process.exitCode = testExitCode;

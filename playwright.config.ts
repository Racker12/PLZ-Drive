import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const systemChromium =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // The cloud browser renders Three.js through software WebGL. Leave time for
  // a real rendered frame and driving checks without assuming hardware speed.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(existsSync(systemChromium) ? { executablePath: systemChromium } : {}),
      args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

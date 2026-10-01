import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Fresh database for every run.
const dataDir = path.join(os.tmpdir(), `tesmenus-e2e-${Date.now()}`);

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 7"],
    // Pre-installed Chromium (sandboxes), otherwise Playwright's own.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100/api/health",
    timeout: 60_000,
    env: { DATA_DIR: dataDir },
  },
});

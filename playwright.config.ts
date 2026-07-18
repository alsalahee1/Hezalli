import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// Use the pre-installed Chromium when it exists (this dev environment); in CI
// the runner installs its own via `playwright install`, so fall back to that.
const CHROME =
  process.env.PW_CHROME ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = fs.existsSync(CHROME) ? { executablePath: CHROME } : {};
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    // Blocked external fonts keep the page from reaching "networkidle"; wait
    // only for the DOM in navigations.
    navigationTimeout: 30_000,
    launchOptions,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Locally, reuse the dev server already running on :3000. In CI, build first
  // and let Playwright start `npm run start`.
  webServer: {
    command: "npm run start",
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

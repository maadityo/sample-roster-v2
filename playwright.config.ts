import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // sequential – shared DB state
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1. Auth setup — logs a test user in and saves cookies
    {
      name: "auth-setup",
      testMatch: "**/auth.setup.ts",
    },
    // 2. All E2E tests — use saved auth state
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/kakak.json",
      },
      dependencies: ["auth-setup"],
    },
  ],

  // Start the Next.js server if not already running
  webServer: process.env.CI
    ? undefined // CI runs the server separately in docker
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

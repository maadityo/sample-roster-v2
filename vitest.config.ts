import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    // Exclude Playwright E2E files — they use @playwright/test, not Vitest
    exclude: ["node_modules/**", "tests/e2e/**"],
    // Run test FILES sequentially — they share a single test DB
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://kakak:kakak_secret@localhost:5432/kakak_test?schema=public",
      NEXTAUTH_SECRET: "test-secret-not-for-production",
      MAX_ABSENCES_PER_MONTH: "2",
      MAX_ABSENCES_PER_SUNDAY: "3",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

/**
 * Playwright auth setup — runs ONCE before all E2E tests.
 *
 * Calls the test-only login endpoint to get a valid NextAuth JWT,
 * saves it as a browser cookie so subsequent tests start authenticated.
 *
 * Requires: NEXTAUTH_TEST_MODE=true in the running Next.js server.
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_DIR = path.join(__dirname, ".auth");
const AUTH_FILE = path.join(AUTH_DIR, "kakak.json");
const TEST_EMAIL = "e2e-kakak@example.com";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

setup("authenticate as test kakak", async ({ page }) => {
  // Ensure the auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  // Call the test login API to get a session JWT
  const res = await page.request.post(`${BASE_URL}/api/test/login`, {
    data: { email: TEST_EMAIL, role: "KAKAK" },
  });

  expect(res.status(), "Test login API must return 200 — ensure NEXTAUTH_TEST_MODE=true is set").toBe(200);

  const { token } = await res.json();
  expect(token).toBeTruthy();

  // Set the NextAuth session cookie
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Verify login works by navigating to the dashboard
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/login/);
  await expect(page.getByText("Hi,")).toBeVisible({ timeout: 10_000 });

  // Save auth state for all subsequent tests
  await page.context().storageState({ path: AUTH_FILE });
});

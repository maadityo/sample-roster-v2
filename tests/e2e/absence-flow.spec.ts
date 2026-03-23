/**
 * E2E Tests — Absence submission flow
 *
 * Tests the complete user journey on the kakak dashboard:
 * - Quota badge shows correct remaining count
 * - Clicking "Ya" opens the reason modal
 * - Submitting absence → quota badge decrements
 * - Clicking "Batalkan" → quota badge increments back
 * - Re-submitting after cancel → works without error
 */
import { test, expect, type Page } from "@playwright/test";

// These tests run sequentially; state is shared via the DB
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
});

test("dashboard loads and shows quota badge", async ({ page }) => {
  // Quota badge must be visible
  const badge = page.locator('[class*="bg-blue-50"], [class*="bg-yellow-50"], [class*="bg-red-50"]').first();
  await expect(badge).toBeVisible({ timeout: 10_000 });

  // Must show "Ijin" in some form
  await expect(page.getByText(/ijin/i).first()).toBeVisible();
});

test("clicking Ya opens the Pengajuan Ijin modal", async ({ page }) => {
  // Find first upcoming schedule with Ya button
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await expect(yaButton).toBeVisible({ timeout: 10_000 });
  await yaButton.click();

  // Modal must appear
  await expect(page.getByText("Pengajuan Ijin")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Submit Ijin" })).toBeVisible();
});

test("closing modal resets the Ya button state", async ({ page }) => {
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await yaButton.click();

  await expect(page.getByText("Pengajuan Ijin")).toBeVisible();

  // Click Batal to close
  await page.getByRole("button", { name: "Batal" }).click();

  // Modal must disappear
  await expect(page.getByText("Pengajuan Ijin")).not.toBeVisible({ timeout: 3_000 });
});

test("submitting absence decrements the quota badge", async ({ page }) => {
  // Read initial quota number
  const remaining = await getRemaining(page);

  // Submit an absence
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await yaButton.click();

  await expect(page.getByText("Pengajuan Ijin")).toBeVisible();

  // Fill in reason (optional)
  const textarea = page.getByPlaceholder(/tulis alasan/i);
  await textarea.fill("E2E test absence");

  // Submit
  await page.getByRole("button", { name: "Submit Ijin" }).click();

  // Modal closes
  await expect(page.getByText("Pengajuan Ijin")).not.toBeVisible({ timeout: 8_000 });

  // Toast success
  await expect(page.getByText(/ijin berhasil/i)).toBeVisible({ timeout: 5_000 });

  // Quota should decrease by 1
  const newRemaining = await getRemaining(page);
  expect(newRemaining).toBe(remaining - 1);

  // The row should now show Pending + Batalkan
  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();
});

test("cancelling absence increments quota badge back", async ({ page }) => {
  // There should already be a Pending absence from the previous test
  const batalkan = page.getByRole("button", { name: "Batalkan" }).first();
  await expect(batalkan).toBeVisible({ timeout: 10_000 });

  const remaining = await getRemaining(page);

  await batalkan.click();

  // Toast and badge update
  await expect(page.getByText(/ijin dibatalkan/i)).toBeVisible({ timeout: 5_000 });

  const newRemaining = await getRemaining(page);
  expect(newRemaining).toBe(remaining + 1);

  // Row returns to Ya / Tidak buttons
  await expect(page.getByRole("button", { name: "Ya" }).first()).toBeVisible({ timeout: 5_000 });
});

test("re-submitting after cancel works without error", async ({ page }) => {
  // Find the same slot (should now show Ya again after previous cancel)
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await yaButton.click();

  await expect(page.getByText("Pengajuan Ijin")).toBeVisible();
  await page.getByRole("button", { name: "Submit Ijin" }).click();

  // Must NOT show an error about duplicate
  await expect(page.getByText(/already have an absence/i)).not.toBeVisible({ timeout: 3_000 });
  await expect(page.getByText(/ijin berhasil/i)).toBeVisible({ timeout: 8_000 });

  // Badge decremented again
  await expect(page.getByText("Pending")).toBeVisible();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the "Tersisa N dari M ijin" text into N */
async function getRemaining(page: Page): Promise<number> {
  const text = await page.getByText(/tersisa \d+ dari \d+ ijin/i).textContent({ timeout: 5_000 });
  if (!text) throw new Error("Quota badge text not found");
  const match = text.match(/tersisa (\d+)/i);
  if (!match) throw new Error(`Could not parse remaining from: "${text}"`);
  return parseInt(match[1], 10);
}

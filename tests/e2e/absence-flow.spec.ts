/**
 * E2E Tests — Absence submission flow
 *
 * Tests the kakak dashboard batch-submit flow (AbsenceSubmitForm):
 * - Quota badge shows correct remaining count
 * - Clicking "Ya" shows inline reason field (NOT a modal)
 * - Batch submit via "Kirim Jadwal" → post-submit view renders
 * - Clicking "Batalkan" cancels one service absence
 * - Page reload preserves consistent state
 *
 * Requires: seed data with Sunday schedules for next month
 */
import { test, expect, type Page } from "@playwright/test";

// These tests run sequentially; state is shared via the DB
test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  // Wait for the quota badge or empty state to appear (server component loaded)
  await expect(
    page
      .getByText(/tersisa \d+ dari \d+ ijin/i)
      .or(page.getByText(/batas ijin/i))
      .or(page.getByText(/belum ada jadwal/i))
  ).toBeVisible({ timeout: 15_000 });
});

test("dashboard loads and shows quota badge", async ({ page }) => {
  // Quota badge text: "Tersisa N dari M ijin" or "Batas Ijin ... Tercapai" at limit
  await expect(
    page.getByText(/tersisa \d+ dari \d+ ijin/i).or(page.getByText(/batas ijin/i))
  ).toBeVisible({ timeout: 10_000 });
});

test("clicking Ya shows inline reason field", async ({ page }) => {
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await expect(yaButton).toBeVisible({ timeout: 10_000 });
  await yaButton.click();

  // Inline "Ijin seharian" section + reason textarea appear (no modal)
  await expect(page.getByText(/ijin seharian/i).first()).toBeVisible({ timeout: 5_000 });
  await expect(page.getByPlaceholder(/alasan ijin/i)).toBeVisible();

  // Batch submit button visible at the bottom
  await expect(page.getByRole("button", { name: /kirim jadwal/i })).toBeVisible();
});

test("clicking Tidak after Ya resets the day choice", async ({ page }) => {
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await yaButton.click();
  await expect(page.getByText(/ijin seharian/i).first()).toBeVisible();

  // Switch to "Tidak"
  await page.getByRole("button", { name: "Tidak" }).first().click();

  // Inline absence section disappears
  await expect(page.getByText(/ijin seharian/i)).not.toBeVisible({ timeout: 5_000 });
});

test("submitting absence shows post-submit view with decremented quota", async ({ page }) => {
  const remaining = await getRemaining(page);

  // Click "Ya" on first Sunday
  const yaButton = page.getByRole("button", { name: "Ya" }).first();
  await yaButton.click();

  // Fill reason
  const textarea = page.getByPlaceholder(/alasan ijin/i);
  if (await textarea.isVisible()) {
    await textarea.fill("E2E test absence");
  }

  // Submit the batch
  const submitButton = page.getByRole("button", { name: /kirim jadwal/i });
  await expect(submitButton).toBeEnabled({ timeout: 5_000 });
  await submitButton.click();

  // Wait for at least one absence API call to succeed
  await page.waitForResponse(
    (res) => res.url().includes("/api/absences") && res.status() < 400,
    { timeout: 15_000 }
  );

  // Toast success
  await expect(page.getByText(/berhasil/i)).toBeVisible({ timeout: 10_000 });

  // Post-submit view: "sudah disubmit" banner
  await expect(page.getByText(/sudah disubmit/i)).toBeVisible({ timeout: 10_000 });

  // Reload for fresh server-rendered data, then verify quota
  await page.reload();
  await page.waitForLoadState("networkidle");
  const newRemaining = await getRemaining(page);
  expect(newRemaining).toBe(remaining - 1);

  // Post-submit row: Pending badge + Batalkan action
  await expect(page.getByText("Pending")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Batalkan")).toBeVisible({ timeout: 5_000 });
});

test("cancelling one absence shows confirmation toast", async ({ page }) => {
  // Post-submit view from previous test — "Batalkan" should be visible
  const batalkan = page.getByText("Batalkan").first();
  await expect(batalkan).toBeVisible({ timeout: 10_000 });

  await batalkan.click();

  // Wait for cancel API
  await page.waitForResponse(
    (res) => res.url().includes("/api/absences/") && res.request().method() === "PATCH",
    { timeout: 10_000 }
  );

  // Toast confirmation
  await expect(page.getByText(/dibatalkan/i)).toBeVisible({ timeout: 5_000 });
});

test("page reload preserves consistent post-submit state", async ({ page }) => {
  // After partial cancel, remaining absences keep the Sunday in "submitted" state
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Post-submit banner still visible
  await expect(page.getByText(/sudah disubmit/i)).toBeVisible({ timeout: 10_000 });

  // Pending badge still present (5 of 6 service absences remain)
  await expect(page.getByText("Pending")).toBeVisible({ timeout: 5_000 });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the "Tersisa N dari M ijin" text into the remaining count */
async function getRemaining(page: Page): Promise<number> {
  const badge = page.getByText(/tersisa \d+ dari \d+ ijin/i);
  await expect(badge).toBeVisible({ timeout: 10_000 });

  const text = await badge.textContent();
  if (!text) throw new Error("Quota badge text not found");

  const match = text.match(/tersisa (\d+)/i);
  if (!match) throw new Error(`Could not parse remaining from: "${text}"`);

  return parseInt(match[1], 10);
}

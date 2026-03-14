/**
 * Shared helpers and fixtures for E2E tests.
 */
import { Page, expect } from "@playwright/test";

export const TEST_ORG_EMAIL = process.env.E2E_EMAIL ?? "e2e@realstateos.dev";
export const TEST_ORG_PASSWORD = process.env.E2E_PASSWORD ?? "E2EPassword!123";

/** Log in via the login page and wait for the dashboard to appear. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_ORG_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_ORG_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.locator("h2, h1")).toBeVisible();
}

/** Wait for and dismiss any toast notification. */
export async function dismissToast(page: Page): Promise<void> {
  const toast = page.locator('[role="alert"]').first();
  try {
    await toast.waitFor({ timeout: 3_000 });
    const closeBtn = toast.locator('button[aria-label="Dismiss notification"]');
    if (await closeBtn.isVisible()) await closeBtn.click();
  } catch {
    // no toast shown, that's fine
  }
}

/** Navigate to a page via the sidebar nav link. */
export async function navigateTo(page: Page, label: string): Promise<void> {
  const link = page.locator(`nav a:has-text("${label}")`).first();
  await link.click();
  await page.waitForLoadState("networkidle");
}

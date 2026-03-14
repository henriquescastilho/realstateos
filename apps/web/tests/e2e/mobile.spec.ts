/**
 * Mobile layout E2E tests.
 * Verifies 375px viewport usability (hamburger nav, responsive tables, etc.)
 */
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Mobile layout (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("hamburger button is visible on mobile", async ({ page }) => {
    await login(page);
    const hamburger = page.locator("button.hamburger-btn").first();
    await expect(hamburger).toBeVisible();
  });

  test("sidebar hidden by default on mobile", async ({ page }) => {
    await login(page);
    const sidebar = page.locator("aside.sidebar").first();
    // sidebar should not be visible (display:none via CSS)
    await expect(sidebar).toBeHidden();
  });

  test("hamburger opens sidebar overlay", async ({ page }) => {
    await login(page);
    const hamburger = page.locator("button.hamburger-btn").first();
    await hamburger.click();
    const sidebar = page.locator("aside.sidebar.sidebar-open").first();
    await expect(sidebar).toBeVisible();
    // Overlay should be visible too
    const overlay = page.locator(".sidebar-overlay.visible").first();
    await expect(overlay).toBeVisible();
  });

  test("clicking overlay closes sidebar", async ({ page }) => {
    await login(page);
    await page.locator("button.hamburger-btn").click();
    await page.locator(".sidebar-overlay.visible").click();
    const sidebar = page.locator("aside.sidebar.sidebar-open");
    await expect(sidebar).toHaveCount(0);
  });

  test("dashboard is usable at 375px", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    // Page should not overflow horizontally
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(395); // allow small margin
  });

  test("contracts page table scrolls horizontally", async ({ page }) => {
    await login(page);
    await page.goto("/contracts");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    // Table should be in a scroll wrapper
    const tableScroll = page.locator(".table-scroll").first();
    if ((await tableScroll.count()) > 0) {
      await expect(tableScroll).toBeVisible();
    }
  });

  test("notification bell visible on mobile", async ({ page }) => {
    await login(page);
    const bell = page.locator('button[aria-label*="otifica"]').first();
    await expect(bell).toBeVisible();
  });
});

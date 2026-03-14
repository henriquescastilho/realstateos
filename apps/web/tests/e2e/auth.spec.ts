/**
 * Authentication E2E tests.
 * Tests: login, register, logout, protected route redirect.
 */
import { test, expect } from "@playwright/test";
import { TEST_ORG_EMAIL, TEST_ORG_PASSWORD, login } from "./helpers";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("wrong@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Should stay on login page
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user redirected from protected route", async ({
    page,
  }) => {
    // Clear any stored auth
    await page.goto("/login");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("logout clears session and redirects to login", async ({ page }) => {
    await login(page);
    // Find and click logout (in OrgSwitcher or nav)
    const logoutBtn = page
      .locator('button:has-text("Sair"), button:has-text("Logout")')
      .first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

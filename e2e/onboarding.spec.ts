import { test, expect } from "@playwright/test";

/**
 * Public-entry smoke tests.
 *
 * Org signup is INVITE-ONLY: src/proxy.ts redirects /signup to /login unless
 * the URL carries a Clerk invite ticket (__clerk_ticket), and the login page
 * no longer links to self-serve registration. The old self-signup onboarding
 * flow these specs used to cover was removed — these tests pin the current
 * invite-only behavior instead. The authed manager/renter journeys live in
 * e2e/manager/ and e2e/renter/.
 */

test("unauthenticated visitor is redirected to the sign-in form", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login([/?#]|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("signup without an invite ticket redirects to login", async ({ page }) => {
  await page.goto("/signup");
  await page.waitForURL(/\/login([/?#]|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("protected pages redirect unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login([/?#]|$)/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("sign-in with unknown credentials shows an error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`nobody.${Date.now()}@amrikahousing.com`);
  await page.getByLabel("Password", { exact: true }).fill("Wrong-Password-123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login([/?#]|$)/);
});

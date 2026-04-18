import { test, expect } from "@playwright/test";

// Clerk test emails bypass real email delivery and always accept OTP 424242.
// See: https://clerk.com/docs/testing/test-emails-and-phones
const CLERK_TEST_OTP = "424242";

test("new org onboarding flow completes and lands on dashboard", async ({ page }) => {
  // Use a unique email per run so re-runs never hit "email already in use".
  const email = `onboarding.${Date.now()}+clerk_test@amrikahousing.com`;
  const password = "Amrik@H0using_E2eT3st!";

  // ── Step 1: Registration form ─────────────────────────────────────────────
  await page.goto("/login");
  await page.getByRole("link", { name: "Create a new organization" }).click();

  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

  await page.getByLabel("First Name").fill("Onboarding");
  await page.getByLabel("Last Name").fill("Test");
  await page.getByLabel("Organization Name").fill("E2E Test Org");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // ── Step 2: Email verification ────────────────────────────────────────────
  await expect(page.getByRole("heading", { name: "Verify email" })).toBeVisible();

  await page.getByLabel("Verification code").fill(CLERK_TEST_OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();

  // ── Step 3: Onboarding wizard — Workspace step ────────────────────────────
  await page.waitForURL("**/onboarding");
  await expect(page.getByText("E2E Test Org")).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();

  // ── Step 4: Onboarding wizard — Invite step ───────────────────────────────
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  // ── Step 5: Done screen ───────────────────────────────────────────────────
  await expect(page.getByText("You're all set!")).toBeVisible();
  await page.getByRole("button", { name: "Go to dashboard" }).click();

  // ── Step 6: Dashboard ─────────────────────────────────────────────────────
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("E2E Test Org")).toBeVisible();
});

test("registration form rejects empty submit with validation message", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create a new organization" }).click();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toContainText("required");
});

test("registration form rejects mismatched passwords", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create a new organization" }).click();

  await page.getByLabel("First Name").fill("Test");
  await page.getByLabel("Email").fill(`mismatch.${Date.now()}+clerk_test@amrikahousing.com`);
  await page.getByLabel("Organization Name").fill("Test Org");
  await page.getByLabel("Password", { exact: true }).fill("Amrik@H0using_E2eT3st!");
  await page.getByLabel("Confirm password").fill("DifferentPassword!");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toContainText("Passwords do not match");
});

test("invite step clears error when user edits an email field", async ({ page }) => {
  // Reach the invite step via a full signup
  const email = `invite-test.${Date.now()}+clerk_test@amrikahousing.com`;
  const password = "Amrik@H0using_E2eT3st!";

  await page.goto("/login");
  await page.getByRole("link", { name: "Create a new organization" }).click();
  await page.getByLabel("First Name").fill("Invite");
  await page.getByLabel("Last Name").fill("Tester");
  await page.getByLabel("Organization Name").fill("Invite Test Org");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Verification code").fill(CLERK_TEST_OTP);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();

  // Trigger an error with a bad email
  await page.locator('input[placeholder="colleague@company.com"]').first().fill("notanemail");
  await page.getByRole("button", { name: "Send invites" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  // Editing the field should clear the error
  await page.locator('input').first().fill("c");
  await expect(page.getByRole("alert")).not.toBeVisible();
});

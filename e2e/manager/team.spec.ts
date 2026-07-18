import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
  "Set E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD in .env.local to run manager specs.",
);

test("team page renders access management and user list controls", async ({ page }) => {
  await page.goto("/team");

  await expect(page.getByRole("heading", { name: "Access Management" })).toBeVisible();
  await expect(
    page.getByPlaceholder("Search users by name, email, or role..."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add User" })).toBeVisible();
});

test("add-user modal requires an email address", async ({ page }) => {
  await page.goto("/team");

  await page.getByRole("button", { name: "Add User" }).click();
  await expect(page.getByRole("heading", { name: "Add user" })).toBeVisible();

  // Submitting without an email surfaces the validation error.
  const form = page.locator("form");
  await form.getByRole("button", { name: "Add User" }).click();
  await expect(page.getByText("Email is required.")).toBeVisible();

  // Typing an email clears the error.
  await page.getByPlaceholder("name@company.com").fill("e2e-invite-check@example.com");
  await expect(page.getByText("Email is required.")).not.toBeVisible();

  // Close without inviting anyone.
  await page.getByRole("button", { name: "Close add user" }).click();
  await expect(page.getByRole("heading", { name: "Add user" })).not.toBeVisible();
});

import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
  "Set E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD in .env.local to run manager specs.",
);

test("accounts overview renders financial summary and charts", async ({ page }) => {
  await page.goto("/accounts");

  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Financial summary" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revenue vs Expenses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View all transactions" })).toBeVisible();
});

test("transactions ledger loads and links back to accounts", async ({ page }) => {
  await page.goto("/accounts/transactions");

  await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();
  await expect(page.getByText("Matching Transactions")).toBeVisible();
  await expect(page.getByRole("region", { name: "Filtered transaction totals" })).toBeVisible();

  // Back link returns to the accounts overview.
  await page.getByRole("link", { name: "Back to accounts" }).click();
  await page.waitForURL("**/accounts");
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
});

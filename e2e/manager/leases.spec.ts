import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
  "Set E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD in .env.local to run manager specs.",
);

test("lease workspace loads with the creation workflow or empty state", async ({ page }) => {
  await page.goto("/leases");

  // With properties, the workspace opens on the creation workflow;
  // without properties it shows an explanatory empty state.
  const workflowPrompt = page.getByText("What would you like to do?");
  const emptyState = page.getByText("Add a property before creating lease templates.");
  await expect(workflowPrompt.or(emptyState)).toBeVisible();
});

test("start step offers upload and update-existing paths for the selected property", async ({ page }) => {
  await page.goto("/leases");

  const workflowPrompt = page.getByText("What would you like to do?");
  const emptyState = page.getByText("Add a property before creating lease templates.");
  await expect(workflowPrompt.or(emptyState)).toBeVisible();
  test.skip(await emptyState.isVisible(), "No properties in this environment.");

  // Property selector plus the two entry cards.
  await expect(page.getByText("Which property is this lease template for?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload existing lease/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Update existing template/ })).toBeVisible();

  // Choosing "Update existing template" opens the template picker panel
  // (which lists saved templates for the property, or explains there are none).
  await page.getByRole("button", { name: /Update existing template/ }).click();
  await expect(page.getByRole("button", { name: /Upload existing lease/ })).not.toBeVisible();
});

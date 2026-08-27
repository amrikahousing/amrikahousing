import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
  "Set E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD in .env.local to run manager specs.",
);

test("dashboard renders portfolio overview", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revenue Trend" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Apartment Mix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Smart Alerts Center" })).toBeVisible();
});

test("properties page shows stats and search filters the list", async ({ page }) => {
  await page.goto("/properties");

  await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  await expect(page.getByText("Total Properties")).toBeVisible();
  await expect(page.getByText("Total Units")).toBeVisible();
  await expect(page.getByText("Occupancy Rate")).toBeVisible();

  // Searching for a string that matches nothing shows the empty state.
  const search = page.getByPlaceholder("Search properties by name or address...");
  await expect(search).toBeVisible();
  await search.fill("zz-no-such-property-zz");
  await expect(page.getByText("No properties found")).toBeVisible();
  await expect(page.getByText("Try adjusting your search criteria")).toBeVisible();

  // Clearing the search restores the list (or the unsearched empty state).
  await search.fill("");
  await expect(page.getByText("Try adjusting your search criteria")).not.toBeVisible();
});

test("create-property modal validates required fields", async ({ page }) => {
  await page.goto("/properties");

  await page.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByRole("heading", { name: "Add property" })).toBeVisible();

  // Submitting the empty form surfaces per-field validation errors.
  const form = page.locator("form");
  await form.getByRole("button", { name: "Add property" }).click();
  await expect(page.getByText("Property name is required.")).toBeVisible();
  await expect(page.getByText("Street address is required.")).toBeVisible();
  await expect(page.getByText("City is required.")).toBeVisible();

  // Typing into a field clears its error.
  await page.getByPlaceholder("e.g. Oak Terrace").fill("E2E Smoke Property");
  await expect(page.getByText("Property name is required.")).not.toBeVisible();

  // Close without creating anything.
  await page.getByRole("button", { name: "Close add property" }).click();
  await expect(page.getByRole("heading", { name: "Add property" })).not.toBeVisible();
});

import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_MANAGER_EMAIL || !process.env.E2E_MANAGER_PASSWORD,
  "Set E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD in .env.local to run manager specs.",
);

test("maintenance page renders request board and settings menu", async ({ page }) => {
  await page.goto("/maintenance");

  await expect(page.getByRole("heading", { name: "Maintenance Requests" })).toBeVisible();
  await expect(
    page.getByPlaceholder("Search by property, unit, type, priority, status, vendor, title..."),
  ).toBeVisible();

  // Settings popover opens and lists the automation toggles.
  await page.getByRole("button", { name: "Maintenance settings" }).click();
  await expect(page.getByText("Enable auto-triage")).toBeVisible();
  await expect(page.getByText("Enable SLA escalations")).toBeVisible();
});

test("searching for a nonsense term shows the no-match state", async ({ page }) => {
  await page.goto("/maintenance");

  const search = page.getByPlaceholder(
    "Search by property, unit, type, priority, status, vendor, title...",
  );
  await search.fill("zz-no-such-request-zz");
  await expect(
    page
      .getByText("No maintenance requests match the current filters.")
      .or(page.getByText("No maintenance requests yet.")),
  ).toBeVisible();
});

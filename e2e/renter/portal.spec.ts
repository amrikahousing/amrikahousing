import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_RENTER_EMAIL || !process.env.E2E_RENTER_PASSWORD,
  "Set E2E_RENTER_EMAIL / E2E_RENTER_PASSWORD in .env.local to run renter specs.",
);

test("portal overview renders the lease summary", async ({ page }) => {
  await page.goto("/renter");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // A correctly provisioned renter must be linked to a tenant record.
  await expect(page.getByText("No tenant record found")).not.toBeVisible();

  // Lease summary card with rent and dates, or the explicit no-lease notice.
  const leaseSummary = page.getByText("Monthly Rent");
  const noLease = page.getByText("No active lease found. Contact your property manager.");
  await expect(leaseSummary.or(noLease)).toBeVisible();

  await expect(page.getByRole("heading", { name: "Recent Payments" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintenance Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lease & Contact" })).toBeVisible();
});

test("lease detail page opens from the portal", async ({ page }) => {
  await page.goto("/renter");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const openLease = page.getByRole("link", { name: "Open lease" });
  test.skip(!(await openLease.isVisible()), "No lease section for this renter.");

  await openLease.click();
  await page.waitForURL("**/renter/lease");
  await expect(page.getByRole("heading", { name: "Lease", exact: true })).toBeVisible();
  await expect(page.getByText("Lease Status")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Current Lease Agreement" })).toBeVisible();
});

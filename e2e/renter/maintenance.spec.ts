import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_RENTER_EMAIL || !process.env.E2E_RENTER_PASSWORD,
  "Set E2E_RENTER_EMAIL / E2E_RENTER_PASSWORD in .env.local to run renter specs.",
);

test("maintenance page renders submit form and timeline", async ({ page }) => {
  await page.goto("/renter/maintenance");

  await expect(page.getByRole("heading", { name: "Maintenance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit Request" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request Timeline" })).toBeVisible();
});

test("submit button stays disabled until a description is entered", async ({ page }) => {
  await page.goto("/renter/maintenance");
  await expect(page.getByRole("heading", { name: "Submit Request" })).toBeVisible();

  const noLease = page.getByText(
    "You need an active lease to submit maintenance requests. Contact your property manager.",
  );
  test.skip(await noLease.isVisible(), "Renter has no active lease in this environment.");

  const description = page.getByPlaceholder(/my heat doesn't work/);
  const submit = page.getByRole("button", { name: "Submit Request" });

  // Validation: empty description cannot be submitted.
  await expect(description).toBeVisible();
  await expect(submit).toBeDisabled();

  // Typing a description enables submission (we do not submit to avoid
  // creating real requests in the shared test environment).
  await description.fill("E2E check: the kitchen faucet drips.");
  await expect(submit).toBeEnabled();

  await description.fill("");
  await expect(submit).toBeDisabled();
});

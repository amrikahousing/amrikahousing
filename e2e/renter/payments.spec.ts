import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_RENTER_EMAIL || !process.env.E2E_RENTER_PASSWORD,
  "Set E2E_RENTER_EMAIL / E2E_RENTER_PASSWORD in .env.local to run renter specs.",
);

test("payments page lists the schedule and history", async ({ page }) => {
  await page.goto("/renter/payments");

  await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
  await expect(page.getByText("Current Balance")).toBeVisible();
  await expect(page.getByText("Paid to Date")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unpaid Charges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage payment methods" })).toBeVisible();

  // Until a charge is selected, the pay panel shows its placeholder.
  await expect(page.getByText("Choose a charge to pay")).toBeVisible();
});

test("add payment method flow opens the Stripe form", async ({ page }) => {
  await page.goto("/renter/payment-methods");

  await expect(page.getByRole("heading", { name: "Payment Methods", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved Payment Methods" })).toBeVisible();

  const addCard = page.getByRole("button", { name: "Add Card" });
  await expect(addCard).toBeVisible();
  test.skip(
    await addCard.isDisabled(),
    "Stripe is not configured in this environment (Add Card is disabled).",
  );

  await addCard.click();
  // The Payment Element renders inside a Stripe iframe next to a Save button.
  await expect(page.getByRole("button", { name: "Save Card" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('iframe[title="Secure payment input frame"]')).toBeVisible({
    timeout: 20_000,
  });

  // Cancel without saving anything.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Save Card" })).not.toBeVisible();
});

test("full card payment with Stripe test card", async ({ page }) => {
  test.skip(
    process.env.E2E_FULL_PAYMENT !== "1",
    "Set E2E_FULL_PAYMENT=1 to run the full Stripe test-card payment (writes payment records).",
  );
  test.setTimeout(180_000);

  // Step 1: make sure a card is on file, adding the 4242 test card if needed.
  await page.goto("/renter/payment-methods");
  const addCard = page.getByRole("button", { name: "Add Card" });
  await expect(addCard).toBeVisible();
  test.skip(await addCard.isDisabled(), "Stripe is not configured in this environment.");

  const hasSavedCard = await page.getByText(/ending in \d{4}/).first().isVisible();
  if (!hasSavedCard) {
    await addCard.click();
    const stripeFrame = page.frameLocator('iframe[title="Secure payment input frame"]');
    await stripeFrame.locator('input[name="number"]').fill("4242 4242 4242 4242");
    await stripeFrame.locator('input[name="expiry"]').fill("12 / 34");
    await stripeFrame.locator('input[name="cvc"]').fill("123");
    const postal = stripeFrame.locator('input[name="postalCode"]');
    if (await postal.isVisible()) await postal.fill("30303");
    await page.getByRole("button", { name: "Save Card" }).click();
    await expect(page.getByText("Card saved.")).toBeVisible({ timeout: 60_000 });
  }

  // Step 2: pay the first unpaid charge.
  await page.goto("/renter/payments");
  await expect(page.getByRole("heading", { name: "Unpaid Charges" })).toBeVisible();
  test.skip(
    await page.getByText("You have no pending charges right now.").isVisible(),
    "No unpaid charges to pay in this environment.",
  );

  // Select the first pending charge, then confirm with the estimated total.
  await page
    .getByRole("button", { name: /Due .* Pay$/ })
    .first()
    .click();
  const payButton = page.getByRole("button", { name: /^Pay \$/ });
  await expect(payButton).toBeEnabled({ timeout: 20_000 });
  await payButton.click();

  await expect(
    page.getByText(/Card payment (received|submitted)\. Updating your ledger now\./),
  ).toBeVisible({ timeout: 60_000 });
});

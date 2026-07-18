import { test, expect } from "@playwright/test";

test.skip(
  !process.env.E2E_RENTER_EMAIL || !process.env.E2E_RENTER_PASSWORD,
  "Set E2E_RENTER_EMAIL / E2E_RENTER_PASSWORD in .env.local to run renter specs.",
);

test("messages page renders conversation thread", async ({ page }) => {
  await page.goto("/renter/messages");

  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
  await expect(page.getByPlaceholder("Type your message...")).toBeVisible();
});

test("send button is disabled for empty drafts and sends a message", async ({ page }) => {
  await page.goto("/renter/messages");

  const input = page.getByPlaceholder("Type your message...");
  const send = page.getByRole("button", { name: "Send" });

  // Validation: cannot send an empty (or whitespace-only) message.
  await expect(send).toBeDisabled();
  await input.fill("   ");
  await expect(send).toBeDisabled();

  // Sending appends the message to the thread (session-local only).
  const body = `E2E smoke message ${Date.now()}`;
  await input.fill(body);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText(body)).toBeVisible();
  await expect(input).toHaveValue("");
});

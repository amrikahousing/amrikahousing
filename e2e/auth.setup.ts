import fs from "node:fs";
import path from "node:path";
import { test as setup, expect, type Page } from "@playwright/test";
import { MANAGER_STORAGE_STATE, RENTER_STORAGE_STATE } from "../playwright.config";

/**
 * Signs in the two long-lived E2E test users (a manager and a renter) once,
 * and saves their session cookies as Playwright storage states. The `manager`
 * and `renter` projects reuse these states so every spec starts signed in.
 *
 * The deployed app uses a PRODUCTION Clerk instance (pk_live) behind the
 * custom email/password form in src/app/login/page.tsx, so @clerk/testing's
 * testing tokens (development instances only) do not apply here. Sign-in goes
 * through the real form, exactly like a user.
 *
 * Required env vars (add them to .env.local):
 *   E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD — a Clerk user with manager access
 *   E2E_RENTER_EMAIL  / E2E_RENTER_PASSWORD  — a Clerk user linked to a tenant record
 */

const MISSING_CREDS_HELP =
  "Create two test users in the Clerk dashboard (a manager and a renter linked to a tenant record), " +
  "then add E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD, E2E_RENTER_EMAIL and E2E_RENTER_PASSWORD to .env.local.";

function writeEmptyStorageState(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }, null, 2));
}

/**
 * First sign-in on an account (or after a policy version bump) lands on the
 * "One more step" policy-acceptance gate instead of navigating: the user must
 * open the combined policy document, scroll it to the end, tick the consent
 * checkbox, and press "Accept & continue" (src/app/login/page.tsx +
 * policy-consent-modal.tsx). Acceptance is saved to the account, so this
 * usually runs at most once per test user.
 */
async function acceptPolicyGateIfShown(page: Page) {
  const gate = page.getByRole("heading", { name: "One more step" });
  if (!(await gate.isVisible().catch(() => false))) return;

  await page.getByRole("button", { name: "Privacy Policy" }).click();
  const dialog = page.getByRole("dialog", { name: "Privacy Policy and Terms of Service" });
  await dialog.waitFor({ timeout: 10_000 });

  // The modal enables its confirm button only once the same-origin policy
  // iframe is scrolled to the end. The iframe starts as about:blank, so keep
  // scrolling on every poll tick until the modal's own aria-live feedback
  // ("You've reached the end.") confirms the gate registered it.
  const iframe = page.locator('iframe[title="Privacy Policy and Terms of Service"]');
  await expect
    .poll(
      async () => {
        await iframe.evaluate((el) => {
          const frame = el as HTMLIFrameElement;
          const doc = frame.contentDocument;
          const scroller = doc?.scrollingElement ?? doc?.documentElement;
          if (!doc || !scroller) return;
          scroller.scrollTop = scroller.scrollHeight;
          frame.contentWindow?.dispatchEvent(new Event("scroll"));
        });
        return dialog.getByText("You've reached the end.").isVisible();
      },
      { timeout: 15_000, message: "policy document never registered as read to the end" },
    )
    .toBe(true);

  await dialog.getByRole("button", { name: "I have read this" }).click({ timeout: 10_000 });
  await page
    .getByLabel("I have read and agree to the Privacy Policy and Terms of Service")
    .check();
  await page.getByRole("button", { name: "Accept & continue" }).click();
}

async function signInAndSave(
  page: Page,
  {
    email,
    password,
    landingPattern,
    storageStatePath,
  }: { email: string; password: string; landingPattern: RegExp; storageStatePath: string },
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The login page resolves the user's role and then hard-navigates renters to
  // /renter and managers to /dashboard, sometimes via an intermediate
  // /login/tasks step (src/app/login/page.tsx) — unless the one-time policy
  // gate appears first. Wait for either, clear the gate if shown, then wait
  // for the final landing.
  await Promise.race([
    page.waitForURL(landingPattern, { timeout: 30_000 }).catch(() => {}),
    page
      .getByRole("heading", { name: "One more step" })
      .waitFor({ timeout: 30_000 })
      .catch(() => {}),
  ]);
  await acceptPolicyGateIfShown(page);
  await page.waitForURL(landingPattern, { timeout: 45_000 });

  // Clerk sets the app-domain __session cookie asynchronously; saving storage
  // state before it lands produces a state the middleware rejects (every
  // authed page then redirects back to /login).
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name.startsWith("__session")),
      {
        timeout: 15_000,
        message: `Clerk __session cookie was never set for ${email} — sign-in did not complete`,
      },
    )
    .toBe(true);

  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
}

setup("authenticate manager", async ({ page }) => {
  const email = process.env.E2E_MANAGER_EMAIL;
  const password = process.env.E2E_MANAGER_PASSWORD;
  if (!email || !password) {
    // Write an empty state so dependent projects can still load their
    // storageState files; their specs self-skip when the env vars are absent.
    writeEmptyStorageState(MANAGER_STORAGE_STATE);
    setup.skip(true, `E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD are not set. ${MISSING_CREDS_HELP}`);
    return;
  }

  await signInAndSave(page, {
    email,
    password,
    landingPattern: /\/dashboard([/?#]|$)/,
    storageStatePath: MANAGER_STORAGE_STATE,
  });
});

setup("authenticate renter", async ({ page }) => {
  const email = process.env.E2E_RENTER_EMAIL;
  const password = process.env.E2E_RENTER_PASSWORD;
  if (!email || !password) {
    writeEmptyStorageState(RENTER_STORAGE_STATE);
    setup.skip(true, `E2E_RENTER_EMAIL / E2E_RENTER_PASSWORD are not set. ${MISSING_CREDS_HELP}`);
    return;
  }

  await signInAndSave(page, {
    email,
    password,
    landingPattern: /\/renter([/?#]|$)/,
    storageStatePath: RENTER_STORAGE_STATE,
  });
});

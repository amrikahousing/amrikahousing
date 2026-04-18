# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: onboarding.spec.ts >> new org onboarding flow completes and lands on dashboard
- Location: e2e/onboarding.spec.ts:7:5

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('link', { name: 'Create a new organization' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content":
    - /url: "#geist-skip-nav"
  - alert [ref=e2]
  - generic [ref=e4]:
    - banner [ref=e5]:
      - link "Vercel logo":
        - /url: /home
        - button "Vercel Logo":
          - img "Vercel Logo"
      - navigation [ref=e6]:
        - navigation [ref=e7]:
          - link "Sign Up" [ref=e8] [cursor=pointer]:
            - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fneon-preview-test-amrikahousing.vercel.app%252Flogin%26nonce%3Dcad9658a61d6de7c0e4c5f2d1ca4fd7202fee2d199f00149d2f8ca1caca0546a
            - paragraph [ref=e10]: Sign Up
    - main [ref=e11]:
      - generic [ref=e13]:
        - heading "Log in to Vercel" [level=1] [ref=e16]
        - generic [ref=e17]:
          - generic [ref=e18]:
            - textbox "Email Address" [ref=e20]
            - button "Continue with Email" [ref=e22] [cursor=pointer]:
              - generic [ref=e23]: Continue with Email
          - generic [ref=e25]:
            - button "Continue with Google" [ref=e26] [cursor=pointer]:
              - img [ref=e29]
              - generic [ref=e35]: Continue with Google
            - button "Continue with GitHub" [ref=e36] [cursor=pointer]:
              - img [ref=e38]
              - generic [ref=e42]: Continue with GitHub
            - button "Continue with Apple" [ref=e43] [cursor=pointer]:
              - img [ref=e45]
              - generic [ref=e48]: Continue with Apple
            - button "Continue with SAML SSO" [ref=e50] [cursor=pointer]:
              - img [ref=e52]
              - generic [ref=e54]: Continue with SAML SSO
            - button "Continue with Passkey" [ref=e55] [cursor=pointer]:
              - img [ref=e57]
              - generic [ref=e59]: Continue with Passkey
            - button "Show other options" [ref=e60] [cursor=pointer]:
              - generic [ref=e61]: Show other options
        - paragraph [ref=e63]:
          - text: Don't have an account?
          - link "Sign Up" [ref=e64] [cursor=pointer]:
            - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fneon-preview-test-amrikahousing.vercel.app%252Flogin%26nonce%3Dcad9658a61d6de7c0e4c5f2d1ca4fd7202fee2d199f00149d2f8ca1caca0546a
      - generic [ref=e67]:
        - link "Terms" [ref=e68] [cursor=pointer]:
          - /url: /legal/terms
        - link "Privacy Policy" [ref=e69] [cursor=pointer]:
          - /url: /legal/privacy-policy
  - generic:
    - generic:
      - generic:
        - generic:
          - img
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | // Clerk test emails bypass real email delivery and always accept OTP 424242.
  4   | // See: https://clerk.com/docs/testing/test-emails-and-phones
  5   | const CLERK_TEST_OTP = "424242";
  6   | 
  7   | test("new org onboarding flow completes and lands on dashboard", async ({ page }) => {
  8   |   // Use a unique email per run so re-runs never hit "email already in use".
  9   |   const email = `onboarding.${Date.now()}+clerk_test@amrikahousing.com`;
  10  |   const password = "Amrik@H0using_E2eT3st!";
  11  | 
  12  |   // ── Step 1: Registration form ─────────────────────────────────────────────
  13  |   await page.goto("/login");
> 14  |   await page.getByRole("link", { name: "Create a new organization" }).click();
      |                                                                       ^ Error: locator.click: Test timeout of 60000ms exceeded.
  15  | 
  16  |   await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  17  | 
  18  |   await page.getByLabel("First Name").fill("Onboarding");
  19  |   await page.getByLabel("Last Name").fill("Test");
  20  |   await page.getByLabel("Organization Name").fill("E2E Test Org");
  21  |   await page.getByLabel("Email").fill(email);
  22  |   await page.getByLabel("Password", { exact: true }).fill(password);
  23  |   await page.getByLabel("Confirm password").fill(password);
  24  |   await page.getByRole("button", { name: "Create account" }).click();
  25  | 
  26  |   // ── Step 2: Email verification ────────────────────────────────────────────
  27  |   await expect(page.getByRole("heading", { name: "Verify email" })).toBeVisible();
  28  | 
  29  |   await page.getByLabel("Verification code").fill(CLERK_TEST_OTP);
  30  |   await page.getByRole("button", { name: "Verify & continue" }).click();
  31  | 
  32  |   // ── Step 3: Onboarding wizard — Workspace step ────────────────────────────
  33  |   await page.waitForURL("**/onboarding");
  34  |   await expect(page.getByText("E2E Test Org")).toBeVisible();
  35  |   await page.getByRole("button", { name: "Get started" }).click();
  36  | 
  37  |   // ── Step 4: Onboarding wizard — Invite step ───────────────────────────────
  38  |   await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  39  |   await page.getByRole("button", { name: "Skip" }).click();
  40  | 
  41  |   // ── Step 5: Done screen ───────────────────────────────────────────────────
  42  |   await expect(page.getByText("You're all set!")).toBeVisible();
  43  |   await page.getByRole("button", { name: "Go to dashboard" }).click();
  44  | 
  45  |   // ── Step 6: Dashboard ─────────────────────────────────────────────────────
  46  |   await page.waitForURL("**/dashboard");
  47  |   await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  48  |   await expect(page.getByText("E2E Test Org")).toBeVisible();
  49  | });
  50  | 
  51  | test("registration form rejects empty submit with validation message", async ({ page }) => {
  52  |   await page.goto("/login");
  53  |   await page.getByRole("link", { name: "Create a new organization" }).click();
  54  |   await page.getByRole("button", { name: "Create account" }).click();
  55  | 
  56  |   await expect(page.getByRole("alert")).toContainText("required");
  57  | });
  58  | 
  59  | test("registration form rejects mismatched passwords", async ({ page }) => {
  60  |   await page.goto("/login");
  61  |   await page.getByRole("link", { name: "Create a new organization" }).click();
  62  | 
  63  |   await page.getByLabel("First Name").fill("Test");
  64  |   await page.getByLabel("Email").fill(`mismatch.${Date.now()}+clerk_test@amrikahousing.com`);
  65  |   await page.getByLabel("Organization Name").fill("Test Org");
  66  |   await page.getByLabel("Password", { exact: true }).fill("Amrik@H0using_E2eT3st!");
  67  |   await page.getByLabel("Confirm password").fill("DifferentPassword!");
  68  |   await page.getByRole("button", { name: "Create account" }).click();
  69  | 
  70  |   await expect(page.getByRole("alert")).toContainText("Passwords do not match");
  71  | });
  72  | 
  73  | test("invite step clears error when user edits an email field", async ({ page }) => {
  74  |   // Reach the invite step via a full signup
  75  |   const email = `invite-test.${Date.now()}+clerk_test@amrikahousing.com`;
  76  |   const password = "Amrik@H0using_E2eT3st!";
  77  | 
  78  |   await page.goto("/login");
  79  |   await page.getByRole("link", { name: "Create a new organization" }).click();
  80  |   await page.getByLabel("First Name").fill("Invite");
  81  |   await page.getByLabel("Last Name").fill("Tester");
  82  |   await page.getByLabel("Organization Name").fill("Invite Test Org");
  83  |   await page.getByLabel("Email").fill(email);
  84  |   await page.getByLabel("Password", { exact: true }).fill(password);
  85  |   await page.getByLabel("Confirm password").fill(password);
  86  |   await page.getByRole("button", { name: "Create account" }).click();
  87  |   await page.getByLabel("Verification code").fill(CLERK_TEST_OTP);
  88  |   await page.getByRole("button", { name: "Verify & continue" }).click();
  89  |   await page.waitForURL("**/onboarding");
  90  |   await page.getByRole("button", { name: "Get started" }).click();
  91  |   await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  92  | 
  93  |   // Trigger an error with a bad email
  94  |   await page.locator('input[placeholder="colleague@company.com"]').first().fill("notanemail");
  95  |   await page.getByRole("button", { name: "Send invites" }).click();
  96  |   await expect(page.getByRole("alert")).toBeVisible();
  97  | 
  98  |   // Editing the field should clear the error
  99  |   await page.locator('input').first().fill("c");
  100 |   await expect(page.getByRole("alert")).not.toBeVisible();
  101 | });
  102 | 
```
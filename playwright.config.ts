import { defineConfig, devices } from "@playwright/test";

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://neon-preview-test-amrikahousing.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Bypass Vercel deployment protection for automation runs.
    // Set VERCEL_AUTOMATION_BYPASS_SECRET from Project Settings → Deployment Protection.
    ...(bypassSecret
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

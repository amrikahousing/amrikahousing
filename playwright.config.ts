import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://neon-preview-test-amrikahousing.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

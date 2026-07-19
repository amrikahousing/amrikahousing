import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Load .env.local for Clerk keys and E2E credentials. dotenv never overrides
// variables that are already set in the environment (e.g. by CI).
dotenv.config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export const MANAGER_STORAGE_STATE = path.resolve(
  __dirname,
  "playwright/.auth/manager.json",
);
export const RENTER_STORAGE_STATE = path.resolve(
  __dirname,
  "playwright/.auth/renter.json",
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Data-heavy pages (accounts, renter portal) fetch from Neon on cold
  // serverless starts; the 5s default expect timeout flakes on first load.
  expect: { timeout: 15_000 },
  retries: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://test.amrikahousing.com",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Bypass Vercel deployment protection for automation runs.
    // Set VERCEL_AUTOMATION_BYPASS_SECRET from Project Settings → Deployment Protection.
    ...(bypassSecret
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } }
      : {}),
  },
  projects: [
    // Signs in the manager and renter test users once and saves storage state.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Root-level specs (e.g. onboarding.spec.ts) run unauthenticated, as before.
    {
      name: "chromium",
      testIgnore: ["auth.setup.ts", "manager/**", "renter/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "manager",
      testDir: "./e2e/manager",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: MANAGER_STORAGE_STATE,
      },
    },
    {
      name: "renter",
      testDir: "./e2e/renter",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: RENTER_STORAGE_STATE,
      },
    },
  ],
});

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Run via `npm run test:integration` (scripts/test-integration.mjs), which
// provisions an ephemeral Neon branch and sets DATABASE_URL/INTEGRATION_TEST
// before invoking Vitest with this config. Files run serially — they share one
// seeded database.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});

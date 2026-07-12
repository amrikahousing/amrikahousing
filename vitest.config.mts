import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: ["src/generated/**", "src/lib/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      // Floor at the measured baseline; scripts/ratchet-coverage.mjs raises the
      // effective bar as coverage improves. Never lower these to make CI pass.
      thresholds: {
        statements: 9,
        branches: 7,
        functions: 9,
        lines: 8,
      },
    },
  },
});

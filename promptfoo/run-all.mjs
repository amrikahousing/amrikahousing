#!/usr/bin/env node
// Runs every promptfoo config under promptfoo/configs/ and fails (exit 1) if any
// config has a failing assertion. Wired to `npm run eval:injection`, which is
// used by both the prod-deploy gate (scripts/promote-prod.mjs) and the weekly
// GitHub Actions workflow (.github/workflows/llm-injection-evals.yml).
//
// Pinned promptfoo version keeps every run (manual / deploy gate / CI)
// reproducible.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTFOO_VERSION = "0.121.17";

const here = dirname(fileURLToPath(import.meta.url));
const configDir = join(here, "configs");

const configs = readdirSync(configDir)
  .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
  .sort();

if (configs.length === 0) {
  console.error("No promptfoo configs found in", configDir);
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — the evals cannot call the model.");
  process.exit(1);
}

const failed = [];

for (const cfg of configs) {
  const path = join(configDir, cfg);
  console.log(`\n=== promptfoo eval: ${cfg} ===`);
  const res = spawnSync(
    "npx",
    ["--yes", `promptfoo@${PROMPTFOO_VERSION}`, "eval", "-c", path],
    { stdio: "inherit" },
  );
  if (res.status !== 0) failed.push(cfg);
}

console.log("\n=== injection eval summary ===");
console.log(`configs run: ${configs.length}`);
if (failed.length) {
  console.error(`FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("all configs passed");

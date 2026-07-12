#!/usr/bin/env node

// Coverage ratchet: fails when unit-test coverage drops below the committed
// baseline (coverage-baseline.json), and raises the baseline automatically
// when coverage improves. Run after `vitest run --coverage` (the json-summary
// reporter must have written coverage/coverage-summary.json).
//
//   npm run test:ci   # vitest run --coverage && node scripts/ratchet-coverage.mjs
//
// When the baseline file changes locally, commit it — that's the ratchet
// clicking upward. Never lower the numbers by hand to make a change pass.

import { readFileSync, writeFileSync } from "node:fs";

const SUMMARY_PATH = "coverage/coverage-summary.json";
const BASELINE_PATH = "coverage-baseline.json";
// Small tolerance so unrelated refactors (moving lines between files) don't
// flake the gate.
const TOLERANCE = 0.25;
const METRICS = ["statements", "branches", "functions", "lines"];

function fail(message) {
  console.error(`\nratchet-coverage: ${message}`);
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(SUMMARY_PATH, "utf8"));
} catch {
  fail(`could not read ${SUMMARY_PATH} — run \`npm run test:coverage\` first.`);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
} catch {
  fail(`could not read ${BASELINE_PATH} — it should be committed at the repo root.`);
}

const current = {};
for (const metric of METRICS) {
  current[metric] = summary.total?.[metric]?.pct;
  if (typeof current[metric] !== "number") {
    fail(`coverage summary is missing total.${metric}.pct`);
  }
}

const regressions = METRICS.filter(
  (metric) => current[metric] < (baseline[metric] ?? 0) - TOLERANCE
);

if (regressions.length > 0) {
  for (const metric of regressions) {
    console.error(
      `  ${metric}: ${current[metric].toFixed(2)}% is below the ${baseline[metric].toFixed(2)}% baseline`
    );
  }
  fail(
    "coverage dropped below the committed baseline. Add or extend tests for the new/changed code — do not edit coverage-baseline.json downward."
  );
}

const improvements = METRICS.filter((metric) => current[metric] > (baseline[metric] ?? 0));
if (improvements.length > 0) {
  const next = { ...baseline };
  for (const metric of improvements) {
    next[metric] = Number(current[metric].toFixed(2));
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `ratchet-coverage: baseline raised (${improvements
      .map((m) => `${m} ${baseline[m]}% → ${next[m]}%`)
      .join(", ")}). Commit ${BASELINE_PATH}.`
  );
} else {
  console.log("ratchet-coverage: coverage is at the baseline. OK.");
}

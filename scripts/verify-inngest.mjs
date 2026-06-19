#!/usr/bin/env node

// Post-deploy guard: assert a deployed app actually serves every Inngest
// function it should, with the signing/event keys present so Inngest Cloud can
// sync it. Catches the failure mode where a stale or under-registered
// deployment silently shows fewer functions in the Inngest dashboard.
//
// The expected count is derived from the serve route (src/app/api/inngest/route.ts)
// so it stays in sync automatically as functions are added/removed.
//
// Usage:
//   node scripts/verify-inngest.mjs <deployment-url>
//   INNGEST_VERIFY_URL=https://... node scripts/verify-inngest.mjs
//
// If the deployment is behind Vercel Deployment Protection, set
// VERCEL_AUTOMATION_BYPASS_SECRET and it is sent as the bypass header.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_FILE = "src/app/api/inngest/route.ts";

function fail(message) {
  console.error(`\nInngest verification failed:\n  - ${message}\n`);
  process.exit(1);
}

// Count the entries in the `functions: [ ... ]` array passed to serve(). The
// route keeps one identifier per line, so a light parse is enough and avoids
// having to import TypeScript with @/ path aliases at runtime.
function expectedFunctionCount(root) {
  const source = readFileSync(join(root, ROUTE_FILE), "utf8");
  const match = source.match(/functions\s*:\s*\[([\s\S]*?)\]/);
  if (!match) {
    fail(`could not find a "functions: [...]" array in ${ROUTE_FILE}.`);
  }

  const entries = match[1]
    .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments
    .replace(/\/\/[^\n]*/g, "") // strip line comments
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    fail(`the "functions: [...]" array in ${ROUTE_FILE} is empty.`);
  }

  return entries.length;
}

async function main() {
  const root = process.cwd();
  const target = process.argv[2] || process.env.INNGEST_VERIFY_URL;
  if (!target) {
    fail("usage: node scripts/verify-inngest.mjs <deployment-url> (or set INNGEST_VERIFY_URL).");
  }

  const base = target.replace(/\/+$/, "");
  const endpoint = base.endsWith("/api/inngest") ? base : `${base}/api/inngest`;
  const expected = expectedFunctionCount(root);

  const headers = { accept: "application/json" };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
  }

  console.log(`Verifying Inngest endpoint: ${endpoint}`);
  console.log(`Expected function_count (from ${ROUTE_FILE}): ${expected}`);

  let response;
  try {
    response = await fetch(endpoint, { method: "GET", headers });
  } catch (error) {
    fail(`request to ${endpoint} failed: ${error.message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    fail(`GET ${endpoint} returned HTTP ${response.status}. Body: ${text.slice(0, 300)}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    fail(`response from ${endpoint} was not JSON. Body: ${text.slice(0, 300)}`);
  }

  const problems = [];
  if (payload.function_count !== expected) {
    problems.push(
      `function_count is ${payload.function_count}, expected ${expected}. ` +
        "The deployment is serving stale or incomplete functions — resync it in Inngest.",
    );
  }
  if (payload.has_signing_key !== true) {
    problems.push(
      "has_signing_key is not true — INNGEST_SIGNING_KEY is missing on this deployment, so Inngest cannot sync it.",
    );
  }
  if (payload.has_event_key !== true) {
    problems.push(
      "has_event_key is not true — INNGEST_EVENT_KEY is missing on this deployment.",
    );
  }
  if (payload.mode && payload.mode !== "cloud") {
    problems.push(`mode is "${payload.mode}", expected "cloud".`);
  }

  if (problems.length > 0) {
    fail(problems.join("\n  - "));
  }

  console.log(
    `Inngest endpoint verified: function_count=${payload.function_count}, ` +
      `has_signing_key=true, has_event_key=true, mode=${payload.mode ?? "unknown"}.`,
  );
}

main();

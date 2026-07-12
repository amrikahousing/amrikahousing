#!/usr/bin/env node

// Integration-test harness: creates an ephemeral copy-on-write Neon branch off
// the preview DB branch, applies Prisma migrations, runs the Vitest
// integration suite (which seeds known fixtures via its globalSetup), then
// deletes the branch. The app's real multi-schema Postgres layout is exercised
// — no mocked Prisma.
//
//   npm run test:integration                # full run
//   npm run test:integration -- --keep-branch   # leave the branch for debugging
//
// Auth: requires NEON_API_KEY (console.neon.tech → Account settings → API
// keys) in the environment or .env.local. Alternatively set TEST_DATABASE_URL
// to reuse an existing throwaway database and skip branch management. Seeding
// upserts fixtures with fixed IDs — never point this at production.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const PROJECT_ID = "dawn-tree-59744987";
const PARENT_BRANCH_NAME = "preview/neon-preview-test";
const NEON_API = "https://console.neon.tech/api/v2";

const keepBranch = process.argv.includes("--keep-branch");

function loadLocalEnv() {
  let raw;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
}

function fail(message) {
  console.error(`\ntest-integration: ${message}`);
  process.exit(1);
}

async function neonRequest(method, path, body) {
  const response = await fetch(`${NEON_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NEON_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neon API ${method} ${path} failed (${response.status}): ${text}`);
  }
  return response.json();
}

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  if (result.error) fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  if (result.status !== 0) {
    return false;
  }
  return true;
}

async function createBranch() {
  const { branches } = await neonRequest("GET", `/projects/${PROJECT_ID}/branches`);
  const parent = branches.find((b) => b.name === PARENT_BRANCH_NAME);
  if (!parent) fail(`parent branch "${PARENT_BRANCH_NAME}" not found in project ${PROJECT_ID}.`);

  const name = `test-integration-${new Date().toISOString().replace(/[:.]/g, "-").toLowerCase()}`;
  console.log(`Creating ephemeral Neon branch "${name}" off "${PARENT_BRANCH_NAME}".`);
  const created = await neonRequest("POST", `/projects/${PROJECT_ID}/branches`, {
    branch: { parent_id: parent.id, name },
    endpoints: [{ type: "read_write" }],
  });

  let connectionUri = created.connection_uris?.[0]?.connection_uri;
  if (!connectionUri) {
    const { databases } = await neonRequest(
      "GET",
      `/projects/${PROJECT_ID}/branches/${created.branch.id}/databases`
    );
    const db = databases[0];
    if (!db) fail("ephemeral branch has no databases.");
    const uri = await neonRequest(
      "GET",
      `/projects/${PROJECT_ID}/connection_uri?branch_id=${created.branch.id}&database_name=${encodeURIComponent(db.name)}&role_name=${encodeURIComponent(db.owner_name)}`
    );
    connectionUri = uri.uri;
  }
  if (!connectionUri) fail("could not resolve a connection string for the ephemeral branch.");
  return { branchId: created.branch.id, name, connectionUri };
}

async function deleteBranch(branchId, name) {
  try {
    await neonRequest("DELETE", `/projects/${PROJECT_ID}/branches/${branchId}`);
    console.log(`Deleted ephemeral Neon branch "${name}".`);
  } catch (error) {
    console.warn(
      `Could not delete ephemeral branch "${name}" (${error.message}). Delete it manually in the Neon console.`
    );
  }
}

loadLocalEnv();

let databaseUrl = process.env.TEST_DATABASE_URL;
let branch = null;

if (!databaseUrl) {
  if (!process.env.NEON_API_KEY) {
    fail(
      "NEON_API_KEY is not set (and no TEST_DATABASE_URL override was given).\n" +
        "Create an API key at console.neon.tech → Account settings → API keys and add\n" +
        "NEON_API_KEY=... to .env.local so the harness can create ephemeral test branches."
    );
  }
  branch = await createBranch();
  databaseUrl = branch.connectionUri;
} else {
  console.log("Using TEST_DATABASE_URL override; skipping Neon branch management.");
}

const testEnv = {
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: databaseUrl,
  INTEGRATION_TEST: "1",
};

let ok = false;
try {
  console.log("Applying Prisma migrations to the test database.");
  ok = run(process.execPath, ["scripts/prisma-migrate-deploy.mjs", "--label", "integration-test branch"], testEnv);
  if (ok) {
    console.log("Running the Vitest integration suite.");
    ok = run("npx", ["vitest", "run", "-c", "vitest.integration.config.mts"], testEnv);
  }
} finally {
  if (branch && !keepBranch) {
    await deleteBranch(branch.branchId, branch.name);
  } else if (branch) {
    console.log(`Keeping branch "${branch.name}" (--keep-branch). DATABASE_URL:\n${databaseUrl}`);
  }
}

process.exit(ok ? 0 : 1);

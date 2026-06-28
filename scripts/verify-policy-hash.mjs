#!/usr/bin/env node

// Build-time guard: assert the pinned policy constants still match the bytes of
// the published legal document on disk. Catches the failure mode where someone
// edits a "published" policy file, bumps the version without updating the hash,
// or points the URL at a missing/renamed file — any of which would make our
// acceptance records (which store version + content_hash) un-provable.
//
// The expected values are read straight from src/lib/policy.ts so this stays in
// sync automatically. Runs with no network access.
//
// Usage:
//   node scripts/verify-policy-hash.mjs

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const POLICY_FILE = "src/lib/policy.ts";

function fail(message) {
  console.error(`\nPolicy hash verification failed:\n  - ${message}\n`);
  process.exit(1);
}

function extract(source, name, pattern) {
  const match = source.match(pattern);
  if (!match) {
    fail(`could not find ${name} in ${POLICY_FILE}.`);
  }
  return match[1];
}

function main() {
  const root = process.cwd();
  const source = readFileSync(join(root, POLICY_FILE), "utf8");

  const version = extract(
    source,
    "CURRENT_POLICY_VERSION",
    /CURRENT_POLICY_VERSION\s*=\s*"([^"]+)"/,
  );
  const expectedHash = extract(
    source,
    "CURRENT_POLICY_HASH",
    /CURRENT_POLICY_HASH\s*=\s*"([0-9a-f]{64})"/,
  );
  const url = extract(
    source,
    "PRIVACY_POLICY_URL",
    /PRIVACY_POLICY_URL\s*=\s*"([^"]+)"/,
  );

  // /legal/foo.html  ->  public/legal/foo.html
  const relativePath = join("public", url.replace(/^\/+/, ""));
  const absolutePath = join(root, relativePath);

  if (!existsSync(absolutePath)) {
    fail(
      `PRIVACY_POLICY_URL points at "${url}", but ${relativePath} does not exist. ` +
        "Published documents must live under /public/legal.",
    );
  }

  // Immutability convention: published files are version-named so old versions
  // are never overwritten (each acceptance can be reproduced byte-for-byte).
  if (!basename(absolutePath).includes(version)) {
    fail(
      `${relativePath} is not named for version "${version}". ` +
        "Publish each version as an immutable, version-named file " +
        "(e.g. privacy-policy-<version>.html).",
    );
  }

  const actualHash = createHash("sha256")
    .update(readFileSync(absolutePath))
    .digest("hex");

  if (actualHash !== expectedHash) {
    fail(
      `${relativePath} has hash ${actualHash}, but CURRENT_POLICY_HASH is ${expectedHash}.\n` +
        "  - Never edit a published policy file. To publish a change, add a new " +
        "version-named file and update CURRENT_POLICY_VERSION, CURRENT_POLICY_HASH, and the URL.",
    );
  }

  console.log(
    `Policy document verified: version=${version}, ` +
      `file=${relativePath}, sha256=${actualHash}.`,
  );
}

main();

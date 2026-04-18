#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const EXPECTED_PROJECT_NAME = "amrikahousing";
const EXPECTED_PROJECT_ID = "prj_hdUfbG36MTUtcftGcn3bSazVX8Ei";
const EXPECTED_ROOT = "/Users/rayansh/Documents/amrikahousing";

const [expectedBranch, target] = process.argv.slice(2);

function fail(message) {
  console.error(`\nDeploy blocked: ${message}\n`);
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    const detail =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      Buffer.isBuffer(error.stderr)
        ? error.stderr.toString().trim()
        : "";
    fail(`git ${args.join(" ")} failed.${detail ? ` ${detail}` : ""}`);
  }
}

if (!expectedBranch || !target) {
  fail("Usage: node scripts/guard-deploy.mjs <branch> <preview|production>");
}

if (!["preview", "production"].includes(target)) {
  fail(`Unknown deployment target "${target}". Use "preview" or "production".`);
}

const cwd = realpathSync(process.cwd());
if (cwd !== EXPECTED_ROOT) {
  fail(`run deploys from ${EXPECTED_ROOT}, not ${cwd}.`);
}

const projectFile = join(cwd, ".vercel", "project.json");
if (!existsSync(projectFile)) {
  fail("missing .vercel/project.json. Link this folder to the amrikahousing Vercel project first.");
}

let project;
try {
  project = JSON.parse(readFileSync(projectFile, "utf8"));
} catch {
  fail(".vercel/project.json is not valid JSON.");
}

if (project.projectName !== EXPECTED_PROJECT_NAME || project.projectId !== EXPECTED_PROJECT_ID) {
  fail(
    `.vercel/project.json points to ${project.projectName ?? "unknown"} (${project.projectId ?? "unknown"}), not ${EXPECTED_PROJECT_NAME}.`
  );
}

const branch = git(["branch", "--show-current"]);
if (branch !== expectedBranch) {
  fail(`current branch is "${branch}". Expected "${expectedBranch}" for ${target} deploy.`);
}

git(["fetch", "origin", expectedBranch]);

const status = git(["status", "--porcelain"]);
if (status) {
  fail("working tree is not clean. Commit or stash changes before deploying.");
}

const localHead = git(["rev-parse", "HEAD"]);
const remoteHead = git(["rev-parse", `origin/${expectedBranch}`]);
if (localHead !== remoteHead) {
  fail(`local ${expectedBranch} is not identical to origin/${expectedBranch}. Pull or push before deploying.`);
}

if (target === "production" && branch !== "main") {
  fail("production deploys are only allowed from main.");
}

if (target === "preview" && branch !== "neon-preview-test") {
  fail("test deploys are only allowed from neon-preview-test.");
}

console.log(`Deploy guard passed: ${target} deploy from ${branch} to Vercel project ${EXPECTED_PROJECT_NAME}.`);

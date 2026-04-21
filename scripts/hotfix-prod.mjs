#!/usr/bin/env node
/**
 * hotfix-prod.mjs — ship a targeted fix directly to production
 *
 * Usage:
 *   npm run hotfix -- "commit message" [file1 file2 ...]
 *
 * If no files are given, whatever is already staged (git add) is committed.
 * The commit is cherry-picked onto main, migrations are applied to the
 * production DB, and main is pushed to trigger a Vercel deployment.
 *
 * Flags:
 *   --yes   skip the confirmation prompt
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  assertBranch,
  assertCanonicalRoot,
  copyVercelProjectLink,
  ensureVercelProject,
  fail,
  findWorktreeForBranch,
  NEON_PRODUCTION_HOST_PREFIX,
  PRODUCTION_DEPLOYMENT_URL,
  assertDatabaseUrlHost,
  pullVercelEnv,
  run,
  runGit,
  syncPrismaSchema,
  waitForVercelGitDeployment,
} from "./deploy-workflow-utils.mjs";
import { execFileSync } from "node:child_process";

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2).filter((a) => a !== "--yes");
const yes = process.argv.includes("--yes");
const [commitMessage, ...files] = args;

if (!commitMessage) {
  console.error("Usage: npm run hotfix -- \"commit message\" [file1 file2 ...]");
  process.exit(1);
}

// ── Preflight ─────────────────────────────────────────────────────────────────

const root = assertCanonicalRoot();
ensureVercelProject(root);
assertBranch("neon-preview-test", root);

// Stage files if provided, otherwise use what's already staged
if (files.length > 0) {
  console.log(`Staging: ${files.join(", ")}`);
  runGit(["add", ...files], { cwd: root });
}

// Verify there's something staged
const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: root }).toString().trim();
if (!staged) {
  fail("nothing staged to commit. Pass file paths or run git add first.");
}

console.log(`\nFiles to commit:\n${staged.split("\n").map((f) => `  ${f}`).join("\n")}\n`);

if (!yes) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    'This will commit to neon-preview-test, cherry-pick to main, apply migrations, and push to production.\nType "HOTFIX" to continue: '
  );
  rl.close();
  if (answer !== "HOTFIX") {
    fail("hotfix was not confirmed.");
  }
}

// ── Commit to neon-preview-test ───────────────────────────────────────────────

console.log("\nCommitting to neon-preview-test...");
runGit(
  ["commit", "-m", `${commitMessage}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`],
  { cwd: root }
);

const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
console.log(`Commit: ${commitSha.slice(0, 7)}`);

// ── Cherry-pick onto main ─────────────────────────────────────────────────────

let mainWorktree = findWorktreeForBranch("main", root);
if (!mainWorktree) {
  fail(
    'No worktree for main found. Run: git worktree add .claude/worktrees/main main'
  );
}

console.log(`\nCherry-picking onto main (${mainWorktree})...`);
copyVercelProjectLink(root, mainWorktree);
assertBranch("main", mainWorktree);
runGit(["fetch", "origin", "main"], { cwd: mainWorktree });
runGit(["pull", "--ff-only", "origin", "main"], { cwd: mainWorktree });
runGit(["cherry-pick", commitSha], { cwd: mainWorktree });

const mainSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: mainWorktree }).toString().trim();

// ── Apply migrations to production DB ────────────────────────────────────────

console.log("\nApplying migrations to Neon production...");
const productionEnv = pullVercelEnv({ cwd: mainWorktree, environment: "production" });
try {
  assertDatabaseUrlHost(productionEnv.values, NEON_PRODUCTION_HOST_PREFIX, "Production");
  syncPrismaSchema({ cwd: mainWorktree, env: productionEnv.values, label: "Neon production" });
} finally {
  productionEnv.cleanup();
}

// ── Push main → trigger Vercel deployment ────────────────────────────────────

console.log("\nPushing main to GitHub...");
runGit(["push", "origin", "main"], { cwd: mainWorktree });

// ── Sync neon-preview-test with main ─────────────────────────────────────────

console.log("\nRebasing neon-preview-test onto main to keep branches in sync...");
execFileSync("git", ["stash"], { cwd: root, stdio: "inherit" });
try {
  runGit(["rebase", "main", "neon-preview-test"], { cwd: root });
  runGit(["push", "--force-with-lease", "origin", "neon-preview-test"], { cwd: root });
} finally {
  execFileSync("git", ["stash", "pop"], { cwd: root, stdio: "inherit" });
}

// ── Wait for deployment ───────────────────────────────────────────────────────

console.log("\nWaiting for Vercel production deployment...");
try {
  waitForVercelGitDeployment({ cwd: mainWorktree, projectName: "amrikahousing", commitSha: mainSha });
  console.log(`\n✓ Hotfix deployed to ${PRODUCTION_DEPLOYMENT_URL}`);
} catch {
  console.log(`\nDeployment triggered. Check ${PRODUCTION_DEPLOYMENT_URL} — it may still be building.`);
}

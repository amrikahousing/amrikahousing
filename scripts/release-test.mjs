#!/usr/bin/env node

import {
  assertBranch,
  assertCanonicalRoot,
  assertCleanTree,
  ensureBranchPushed,
  ensureVercelProject,
  run,
} from "./deploy-workflow-utils.mjs";

const dryRun = process.argv.includes("--dry-run");
const root = assertCanonicalRoot();

ensureVercelProject(root);
assertBranch("neon-preview-test", root);
assertCleanTree(root);

console.log("Checking the test branch before deploy.");
run("npm", ["run", "lint"], { cwd: root });
run("npm", ["run", "build"], { cwd: root });
assertCleanTree(root);

if (dryRun) {
  console.log("Dry run complete: neon-preview-test is ready to push and deploy to test.");
  process.exit(0);
}

ensureBranchPushed("neon-preview-test", root);

console.log("Deploying neon-preview-test to the Vercel test/preview environment.");
run("npx", ["vercel", "deploy", "-y"], { cwd: root });


#!/usr/bin/env node

import {
  assertBranch,
  assertCanonicalRoot,
  assertCleanTree,
  deploymentUrlFromOutput,
  ensureBranchPushed,
  ensureVercelProject,
  run,
  runAndCapture,
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
const deployOutput = runAndCapture("npx", ["vercel", "deploy", "-y"], { cwd: root });
const deploymentUrl = deploymentUrlFromOutput(deployOutput);

if (deploymentUrl) {
  console.log(`\nTest deployment URL: ${deploymentUrl}`);
} else {
  console.log("\nTest deployment finished, but no deployment URL was found in the Vercel output.");
}

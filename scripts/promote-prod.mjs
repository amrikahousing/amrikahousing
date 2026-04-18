#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  assertBranch,
  assertCanonicalRoot,
  assertCleanTree,
  copyVercelProjectLink,
  deploymentUrlFromOutput,
  ensureBranchPushed,
  ensureVercelProject,
  fail,
  findWorktreeForBranch,
  run,
  runAndCapture,
  runGit,
} from "./deploy-workflow-utils.mjs";

const dryRun = process.argv.includes("--dry-run");
const yes = process.argv.includes("--yes");
const root = assertCanonicalRoot();

ensureVercelProject(root);
assertBranch("neon-preview-test", root);
assertCleanTree(root);

if (!yes && !dryRun) {
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    'This will merge tested neon-preview-test changes into main, push main, and deploy production. Type "PROMOTE" to continue: '
  );
  rl.close();

  if (answer !== "PROMOTE") {
    fail("production promotion was not confirmed.");
  }
}

console.log("Checking the tested branch before promotion.");
run("npm", ["run", "lint"], { cwd: root });
run("npm", ["run", "build"], { cwd: root });
assertCleanTree(root);

if (dryRun) {
  console.log("Dry run complete: production promotion checks passed before merge/deploy steps.");
  process.exit(0);
}

ensureBranchPushed("neon-preview-test", root);

let mainWorktree = findWorktreeForBranch("main", root);
if (!mainWorktree) {
  console.log("Switching this workspace to main for production promotion.");
  runGit(["switch", "main"], { cwd: root });
  mainWorktree = root;
}

console.log(`Using main worktree at ${mainWorktree}.`);
copyVercelProjectLink(root, mainWorktree);
assertBranch("main", mainWorktree);
ensureVercelProject(mainWorktree);
assertCleanTree(mainWorktree);

runGit(["fetch", "origin", "main"], { cwd: mainWorktree });
runGit(["fetch", "origin", "neon-preview-test"], { cwd: mainWorktree });
runGit(["pull", "--ff-only", "origin", "main"], { cwd: mainWorktree });

console.log("Merging tested neon-preview-test changes into main.");
runGit(["merge", "--no-ff", "origin/neon-preview-test", "-m", "Merge tested preview changes"], {
  cwd: mainWorktree,
});

console.log("Checking main after merge.");
run("npm", ["run", "lint"], { cwd: mainWorktree });
run("npm", ["run", "build"], { cwd: mainWorktree });
assertCleanTree(mainWorktree);

console.log("Pushing main to GitHub.");
runGit(["push", "origin", "main"], { cwd: mainWorktree });

console.log("Deploying main to production.");
const deployOutput = runAndCapture("npx", ["vercel", "deploy", "--prod", "-y"], { cwd: mainWorktree });
const deploymentUrl = deploymentUrlFromOutput(deployOutput);

if (deploymentUrl) {
  console.log(`\nProduction deployment URL: ${deploymentUrl}`);
} else {
  console.log("\nProduction deployment finished, but no deployment URL was found in the Vercel output.");
}

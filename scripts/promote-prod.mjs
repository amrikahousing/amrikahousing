#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  assertBranch,
  assertCanonicalRoot,
  assertCleanTree,
  NEON_PREVIEW_HOST_PREFIX,
  NEON_PRODUCTION_HOST_PREFIX,
  PRODUCTION_DEPLOYMENT_URL,
  assertDatabaseUrlHost,
  copyVercelProjectLink,
  ensureBranchPushed,
  ensureVercelProject,
  fail,
  findWorktreeForBranch,
  inspectVercelDeployment,
  pullVercelEnv,
  run,
  runGit,
  syncPrismaSchema,
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
console.log("Checking Vercel preview env points to Neon preview/neon-preview-test.");
const previewEnv = pullVercelEnv({ cwd: root, environment: "preview", gitBranch: "neon-preview-test" });
try {
  assertDatabaseUrlHost(previewEnv.values, NEON_PREVIEW_HOST_PREFIX, "Preview");
  run("npm", ["run", "lint"], { cwd: root });
  run("npm", ["run", "build"], { cwd: root, env: previewEnv.values });
  assertCleanTree(root);
} finally {
  previewEnv.cleanup();
}

console.log("Checking Vercel production env points to Neon production.");
const productionEnv = pullVercelEnv({ cwd: root, environment: "production" });
try {
  assertDatabaseUrlHost(productionEnv.values, NEON_PRODUCTION_HOST_PREFIX, "Production");

  if (dryRun) {
  console.log("Dry run complete: production promotion checks passed before merge/deploy steps.");
  process.exit(0);
  }
} finally {
  productionEnv.cleanup();
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

console.log("Checking Vercel production env points to Neon production.");
const mainProductionEnv = pullVercelEnv({ cwd: mainWorktree, environment: "production" });
try {
  assertDatabaseUrlHost(mainProductionEnv.values, NEON_PRODUCTION_HOST_PREFIX, "Production");
  run("npm", ["run", "build"], { cwd: mainWorktree, env: mainProductionEnv.values });
  assertCleanTree(mainWorktree);
  syncPrismaSchema({ cwd: mainWorktree, env: mainProductionEnv.values, label: "Neon production" });
} finally {
  mainProductionEnv.cleanup();
}

console.log("Pushing main to GitHub.");
runGit(["push", "origin", "main"], { cwd: mainWorktree });

console.log("Git push triggered the Vercel production deployment. Waiting for production to finish.");
const deployment = inspectVercelDeployment(PRODUCTION_DEPLOYMENT_URL, mainWorktree);
const deploymentUrl = `https://${deployment.url}`;

console.log(`\nProduction deployment URL: ${PRODUCTION_DEPLOYMENT_URL}`);
console.log(`Vercel deployment URL: ${deploymentUrl}`);

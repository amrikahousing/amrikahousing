#!/usr/bin/env node

import {
  assertBranch,
  assertCanonicalRoot,
  assertCleanTree,
  commitLocalChanges,
  EXPECTED_PROJECT_NAME,
  git,
  NEON_PREVIEW_HOST_PREFIX,
  TEST_DEPLOYMENT_ALIAS,
  assertDatabaseUrlHost,
  ensureBranchPushed,
  ensureVercelProject,
  hostnameFromUrl,
  pullVercelEnv,
  run,
  runAndCapture,
  syncPrismaSchema,
  waitForVercelGitDeployment,
} from "./deploy-workflow-utils.mjs";

const dryRun = process.argv.includes("--dry-run");
const skipE2e = process.argv.includes("--skip-e2e");
const root = assertCanonicalRoot();

ensureVercelProject(root);
assertBranch("neon-preview-test", root);

if (dryRun) {
  assertCleanTree(root);
} else {
  commitLocalChanges(root);
}

console.log("Checking the test branch before deploy.");
console.log("Checking Vercel preview env points to Neon preview/neon-preview-test.");
const previewEnv = pullVercelEnv({ cwd: root, environment: "preview", gitBranch: "neon-preview-test" });

try {
  assertDatabaseUrlHost(previewEnv.values, NEON_PREVIEW_HOST_PREFIX, "Preview");
  run("npm", ["run", "lint"], { cwd: root });
  run("npm", ["run", "build"], { cwd: root, env: previewEnv.values, hideLocalEnvFiles: true });
  assertCleanTree(root);

  if (dryRun) {
    console.log(`Dry run complete: neon-preview-test is ready to push and deploy to https://${TEST_DEPLOYMENT_ALIAS}.`);
    process.exit(0);
  }

  syncPrismaSchema({ cwd: root, env: previewEnv.values, label: "Neon preview/neon-preview-test" });
} finally {
  previewEnv.cleanup();
}

const pushed = ensureBranchPushed("neon-preview-test", root);
const headSha = git(["rev-parse", "HEAD"], { cwd: root });
if (pushed) {
  console.log("Git push triggered the Vercel preview deployment.");
} else {
  console.log("No new Git push was needed; using the latest Vercel branch deployment.");
}

console.log(`Waiting for the Vercel Git deployment for ${headSha.slice(0, 7)}.`);
const deployment = waitForVercelGitDeployment({
  cwd: root,
  projectName: EXPECTED_PROJECT_NAME,
  commitSha: headSha,
});
const deploymentUrl = `https://${deployment.url}`;

console.log(`Assigning stable test alias https://${TEST_DEPLOYMENT_ALIAS}.`);
runAndCapture("npx", ["vercel", "alias", "set", hostnameFromUrl(deploymentUrl), TEST_DEPLOYMENT_ALIAS], {
  cwd: root,
});

if (skipE2e) {
  console.log("\nSkipping E2E smoke tests (--skip-e2e).");
} else {
  console.log(`\nRunning E2E smoke tests against https://${TEST_DEPLOYMENT_ALIAS}.`);
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret) {
    console.warn("Warning: VERCEL_AUTOMATION_BYPASS_SECRET is not set. Tests will fail if deployment protection is enabled.");
  }
  run("npm", ["run", "test:e2e"], {
    cwd: root,
    env: {
      E2E_BASE_URL: `https://${TEST_DEPLOYMENT_ALIAS}`,
      ...(bypassSecret ? { VERCEL_AUTOMATION_BYPASS_SECRET: bypassSecret } : {}),
    },
  });
}

console.log(`\nTest deployment URL: https://${TEST_DEPLOYMENT_ALIAS}`);
console.log(`Vercel branch deployment URL: ${deploymentUrl}`);

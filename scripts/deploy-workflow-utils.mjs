import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";

export const EXPECTED_PROJECT_NAME = "amrikahousing";
export const EXPECTED_PROJECT_ID = "prj_hdUfbG36MTUtcftGcn3bSazVX8Ei";
export const EXPECTED_ROOT = "/Users/rayansh/Documents/amrikahousing";
export const TEST_DEPLOYMENT_ALIAS = "neon-preview-test-amrikahousing.vercel.app";
export const TEST_GIT_BRANCH_ALIAS = "amrikahousing-git-neon-preview-test-amrika-housings-projects.vercel.app";
export const PRODUCTION_DEPLOYMENT_URL = "https://www.amrikahousing.com";
export const NEON_PREVIEW_HOST_PREFIX = "ep-mute-mode-amov2nuk";
export const NEON_PRODUCTION_HOST_PREFIX = "ep-spring-boat-amf4cngn";

export function fail(message) {
  console.error(`\nWorkflow blocked: ${message}\n`);
  process.exit(1);
}

export function cwdRealpath(cwd = process.cwd()) {
  return realpathSync(cwd);
}

export function assertCanonicalRoot() {
  const cwd = cwdRealpath();
  if (cwd !== EXPECTED_ROOT) {
    fail(`run this command from ${EXPECTED_ROOT}, not ${cwd}.`);
  }
  return cwd;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with status ${result.status}.`);
  }
}

export function runAndCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ? { ...process.env, ...options.env } : process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} exited with status ${result.status}.`);
  }

  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

export function deploymentUrlFromOutput(output) {
  const urls = output.match(/https:\/\/[^\s]+/g) ?? [];
  const deploymentUrls = urls.filter((url) => url.includes(".vercel.app") || url.includes("amrikahousing.com"));
  return deploymentUrls.at(-1) ?? urls.at(-1) ?? null;
}

export function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function capture(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env ? { ...process.env, ...options.env } : process.env,
      maxBuffer: 1024 * 1024 * 16,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const detail =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      Buffer.isBuffer(error.stderr)
        ? error.stderr.toString().trim()
        : "";
    fail(`${command} ${args.join(" ")} failed.${detail ? ` ${detail}` : ""}`);
  }
}

export function git(args, options = {}) {
  return capture("git", args, options);
}

export function runGit(args, options = {}) {
  run("git", args, options);
}

export function currentBranch(cwd = process.cwd()) {
  return git(["branch", "--show-current"], { cwd });
}

export function assertBranch(branch, cwd = process.cwd()) {
  const current = currentBranch(cwd);
  if (current !== branch) {
    fail(`current branch is "${current}". Expected "${branch}".`);
  }
}

export function assertCleanTree(cwd = process.cwd()) {
  const status = git(["status", "--porcelain"], { cwd });
  if (status) {
    fail("working tree is not clean. Commit or stash changes before continuing.");
  }
}

export function ensureVercelProject(cwd = process.cwd()) {
  const projectFile = join(cwdRealpath(cwd), ".vercel", "project.json");
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

  return project;
}

export function copyVercelProjectLink(fromCwd, toCwd) {
  const from = cwdRealpath(fromCwd);
  const to = cwdRealpath(toCwd);
  if (from === to) {
    ensureVercelProject(to);
    return;
  }

  const source = join(from, ".vercel", "project.json");
  const targetDir = join(to, ".vercel");
  const target = join(targetDir, "project.json");

  if (!existsSync(source)) {
    fail("source .vercel/project.json is missing.");
  }

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, target);
  ensureVercelProject(toCwd);
}

export function ensureBranchPushed(branch, cwd = process.cwd()) {
  runGit(["fetch", "origin", branch], { cwd });

  const localHead = git(["rev-parse", branch], { cwd });
  const remoteHead = git(["rev-parse", `origin/${branch}`], { cwd });
  if (localHead === remoteHead) {
    console.log(`${branch} is already synced with origin/${branch}.`);
    return false;
  }

  const mergeBase = git(["merge-base", branch, `origin/${branch}`], { cwd });
  if (mergeBase === remoteHead) {
    console.log(`Pushing ${branch} to origin/${branch}.`);
    runGit(["push", "origin", branch], { cwd });
    return true;
  }

  if (mergeBase === localHead) {
    fail(`${branch} is behind origin/${branch}. Pull the latest changes before continuing.`);
  }

  fail(`${branch} has diverged from origin/${branch}. Resolve it manually before continuing.`);
}

export function pullVercelEnv({ cwd = process.cwd(), environment, gitBranch }) {
  const tempDir = mkdtempSync(join(tmpdir(), "amrikahousing-vercel-env-"));
  const envFile = join(tempDir, `${environment}.env`);

  const args = ["vercel", "env", "pull", envFile, "--environment", environment];
  if (gitBranch) {
    args.push("--git-branch", gitBranch);
  }

  try {
    run("npx", args, { cwd });
    return {
      values: parseDotenv(readFileSync(envFile)),
      cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export function assertDatabaseUrlHost(env, expectedHostPrefix, label) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    fail(`${label} DATABASE_URL is missing or empty in Vercel environment variables.`);
  }

  let host;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    fail(`${label} DATABASE_URL is not a valid Postgres URL.`);
  }

  if (!host.includes(expectedHostPrefix)) {
    fail(`${label} DATABASE_URL points to ${host}, expected Neon host containing ${expectedHostPrefix}.`);
  }

  console.log(`${label} database verified: ${host}`);
}

export function syncPrismaSchema({ cwd = process.cwd(), env, label }) {
  const prismaEnv = { ...env, DATABASE_URL: env.DATABASE_URL };
  const migrationsDir = join(cwdRealpath(cwd), "prisma", "migrations");

  if (existsSync(migrationsDir)) {
    console.log(`Applying Prisma migrations to ${label}.`);
    run("npx", ["prisma", "migrate", "deploy"], { cwd, env: prismaEnv });
    return;
  }

  console.log(`Syncing Prisma schema to ${label}.`);
  run("npx", ["prisma", "db", "push", "--skip-generate"], { cwd, env: prismaEnv });
}

export function inspectVercelDeployment(aliasOrUrl, cwd = process.cwd()) {
  const output = capture(
    "npx",
    ["vercel", "inspect", aliasOrUrl, "--wait", "--timeout", "10m", "--format=json"],
    { cwd }
  );
  const jsonStart = output.indexOf("{");
  if (jsonStart === -1) {
    fail(`could not parse Vercel inspect output for ${aliasOrUrl}.`);
  }

  try {
    return JSON.parse(output.slice(jsonStart));
  } catch {
    fail(`Vercel inspect output for ${aliasOrUrl} was not valid JSON.`);
  }
}

export function findWorktreeForBranch(branch, cwd = process.cwd()) {
  const output = git(["worktree", "list", "--porcelain"], { cwd });
  const entries = output.split(/\n(?=worktree )/g);

  for (const entry of entries) {
    const lines = entry.split("\n");
    const worktreeLine = lines.find((line) => line.startsWith("worktree "));
    const branchLine = lines.find((line) => line === `branch refs/heads/${branch}`);
    if (worktreeLine && branchLine) {
      return worktreeLine.slice("worktree ".length);
    }
  }

  return null;
}

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_PROJECT_NAME = "amrikahousing";
export const EXPECTED_PROJECT_ID = "prj_hdUfbG36MTUtcftGcn3bSazVX8Ei";
export const EXPECTED_ROOT = "/Users/rayansh/Documents/amrikahousing";
export const TEST_DEPLOYMENT_ALIAS = "neon-preview-test-amrikahousing.vercel.app";
export const PRODUCTION_DEPLOYMENT_URL = "https://www.amrikahousing.com";

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
    return;
  }

  const mergeBase = git(["merge-base", branch, `origin/${branch}`], { cwd });
  if (mergeBase === remoteHead) {
    console.log(`Pushing ${branch} to origin/${branch}.`);
    runGit(["push", "origin", branch], { cwd });
    return;
  }

  if (mergeBase === localHead) {
    fail(`${branch} is behind origin/${branch}. Pull the latest changes before continuing.`);
  }

  fail(`${branch} has diverged from origin/${branch}. Resolve it manually before continuing.`);
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

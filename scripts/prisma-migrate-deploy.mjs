#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local", quiet: true });

const PRISMA_MIGRATION_ADVISORY_LOCK = 72707369;
const STALE_LOCK_MIN_AGE_SECONDS = 10;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runPrismaMigrateDeploy() {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
    shell: false,
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function combinedOutput(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function shouldInspectPrismaAdvisoryLock(result) {
  const output = combinedOutput(result);
  return (
    result.status !== 0 &&
    ((output.includes("P1002") &&
      output.includes(`pg_advisory_lock(${PRISMA_MIGRATION_ADVISORY_LOCK})`)) ||
      output.includes("Schema engine error"))
  );
}

async function terminateStalePrismaLock({ label }) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("DATABASE_URL is not set; cannot inspect Prisma migration advisory locks.");
    return false;
  }

  const sql = neon(databaseUrl);
  const locks = await sql`
    select
      l.pid,
      a.state,
      a.application_name,
      a.wait_event_type,
      a.wait_event,
      extract(epoch from (now() - coalesce(a.query_start, a.backend_start)))::float8 as age_seconds,
      left(a.query, 160) as query
    from pg_locks l
    left join pg_stat_activity a on a.pid = l.pid
    where l.locktype = 'advisory'
      and l.objid = ${PRISMA_MIGRATION_ADVISORY_LOCK}
      and l.granted = true
    order by age_seconds desc nulls last
  `;

  const staleLocks = locks.filter((lock) => {
    const ageSeconds = Number(lock.age_seconds ?? 0);
    return lock.pid && lock.state === "idle" && ageSeconds >= STALE_LOCK_MIN_AGE_SECONDS;
  });

  if (staleLocks.length === 0) {
    console.warn(
      `Prisma migration lock is still held for ${label}, but no idle stale holder was found. Leaving it alone.`
    );
    if (locks.length > 0) {
      console.warn(
        locks
          .map((lock) => {
            const ageSeconds = Number(lock.age_seconds ?? 0).toFixed(1);
            return `pid=${lock.pid} state=${lock.state ?? "unknown"} age=${ageSeconds}s app=${lock.application_name ?? "unknown"}`;
          })
          .join("\n")
      );
    }
    return false;
  }

  for (const lock of staleLocks) {
    const ageSeconds = Number(lock.age_seconds ?? 0).toFixed(1);
    console.warn(
      `Terminating idle stale Prisma migration lock holder pid=${lock.pid} for ${label} (age ${ageSeconds}s).`
    );
    await sql`select pg_terminate_backend(${lock.pid})`;
  }

  return true;
}

async function main() {
  const label = argValue("--label") ?? "database";

  let result = runPrismaMigrateDeploy();
  if (result.error) {
    console.error(`npx prisma migrate deploy failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status === 0) {
    return;
  }

  if (!shouldInspectPrismaAdvisoryLock(result)) {
    process.exit(result.status ?? 1);
  }

  console.warn(`Prisma migration failed for ${label}. Checking for a stale advisory lock holder.`);

  let terminated = false;
  try {
    terminated = await terminateStalePrismaLock({ label });
  } catch (error) {
    console.warn(`Could not inspect or clear the Prisma migration lock for ${label}: ${error.message}`);
  }

  if (!terminated) {
    process.exit(result.status ?? 1);
  }

  sleep(2000);
  console.warn("Retrying Prisma migrations after clearing the stale lock.");
  result = runPrismaMigrateDeploy();

  if (result.error) {
    console.error(`npx prisma migrate deploy failed: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

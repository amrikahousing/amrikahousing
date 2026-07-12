<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git Branch Policy

Never create a branch other than `main` or `neon-preview-test`. Always work on one of these two branches. Do not use `git checkout -b`, `git switch -c`, or `git branch <name>` with any other branch name.

# Testing Policy

- Every new or modified module in `src/lib/` must have a colocated `<name>.test.ts` (Vitest) created or updated in the same change. Pure logic (money, dates, matching, parsing) belongs in `src/lib` so it stays unit-testable — keep API routes thin.
- Every new API route needs either an integration test in `tests/integration/` or a Playwright spec in `e2e/` covering it.
- Run `npm run test` (and `npm run typecheck`) before invoking any deploy script. CI on `neon-preview-test`/`main` enforces lint + typecheck + unit tests + coverage.
- Never weaken coverage thresholds or delete tests to make a change pass; fix the code or extend the tests.

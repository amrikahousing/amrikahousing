---
name: verify
description: Verify pending changes in this repo end-to-end — lint, typecheck, unit tests + coverage ratchet, testing-policy check for changed src/lib modules and API routes. Use before committing or invoking any deploy script.
---

# Verify changes (amrikahousing)

Run every step; report all failures at the end, not just the first.

## 1. Static gates

```bash
npm run lint
npm run typecheck
```

## 2. Unit tests + coverage ratchet

```bash
npm run test:ci
```

If `ratchet-coverage` raised the baseline, remind the user to commit `coverage-baseline.json`. If it failed because coverage dropped, the fix is writing tests for the new/changed code — never editing the baseline or thresholds downward.

## 3. Testing-policy check (AGENTS.md)

For the pending diff (`git diff --name-only HEAD` plus untracked files):

- Every changed `src/lib/<name>.ts` (excluding `.test.ts`/`.d.ts`) must have a colocated `src/lib/<name>.test.ts` that is **also in the diff** (new or updated). Flag any module whose spec is missing or untouched.
- Every new route handler under `src/app/api/**/route.ts` must be referenced by a test in `tests/integration/` or a spec in `e2e/`. Flag uncovered new routes.
- Changes to `src/inngest/*.ts` should update the colocated `*.test.ts` (@inngest/test based).

## 4. Runtime spot-check

If the change has a user-facing surface, drive it for real: `npm run dev`, exercise the affected page/route (browser tools or curl for API routes), and confirm the new behavior plus no console/server errors. Skip only for pure refactors fully covered by steps 1–3.

## 5. Optional deeper layers

- DB-touching changes: `npm run test:integration` (needs `NEON_API_KEY` in `.env.local`; creates and deletes an ephemeral Neon branch).
- UI flows: `npm run test:e2e` against the deployed test site (or `E2E_BASE_URL=http://localhost:3000`).
- LLM prompt/firewall changes: `npm run eval:injection` (costs a few cents, needs `ANTHROPIC_API_KEY`).

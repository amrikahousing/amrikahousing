# promptfoo — LLM injection / behavior evals

Tests our AI prompts against Claude, including prompt-injection attacks, so we
catch regressions if a system prompt or the LLM firewall
(`src/lib/llm-firewall.ts`) is weakened.

Each prompt under `prompts/` mirrors the request a route sends *after* the
firewall runs — system prompt + `untrustedDataNotice()`, and (where the route
does it) user text wrapped in `<untrusted_user_data>` via `wrapUntrusted()`. So
a passing run means the firewall's defenses are actually holding.

## Layout

```
promptfoo/
  configs/       one YAML per route (prompts + tests + assertions)
  prompts/       the chat prompt each config uses
  run-all.mjs    runs every config, fails if any assertion fails
```

`npm run eval:injection` runs `run-all.mjs`, which executes **every** config in
`configs/`.

## Coverage

| Route | Config | Notes |
|-------|--------|-------|
| `renter/maintenance/parse` | `maintenance-parse.yaml` | free text → structured JSON; tag-wrapped input |
| `ai-import` | `ai-import.yaml` | free text → properties JSON; tag-wrapped input |
| `accounting/category-suggestions` | `accounting-categories.yaml` | injection via a malicious **vendor name** (notice-only defense — this route doesn't tag-wrap) |

Each config has **functional** tests (the prompt still does its job) and
**injection** tests (the firewall boundary holds).

### Not yet covered (and why)

The document-ingesting routes — `renters/lease-parse`, the two
`lease-templates/*review` routes, and the `fill-lease.ts` substitution phase —
send **PDF/image document blocks** (or a very large extracted-text prompt) rather
than a short templatable string. Faithfully testing them at the prompt level
needs binary document fixtures and near-verbatim copies of large prompts that
drift from source. The right way to cover them is an **end-to-end HTTP eval**
that hits the running route with a fixture document (promptfoo supports an
`http` provider). Until then, their firewall defenses are exercised indirectly:
they use the same `untrustedDataNotice()` / `wrapUntrusted()` helpers validated
here.

## Run

```bash
# whole suite (from repo root)
ANTHROPIC_API_KEY=sk-ant-... npm run eval:injection

# a single config
ANTHROPIC_API_KEY=sk-ant-... npx promptfoo@0.121.17 eval -c promptfoo/configs/ai-import.yaml

# open the interactive results table for the last run
npx promptfoo@0.121.17 view
```

## Cost

promptfoo itself is free (open source). The only cost is the Anthropic API
tokens: each test case is one Claude **Haiku** call, and `llm-rubric` assertions
add one grader call. The full suite is a few cents per run.

## When it runs

Both triggers go through `npm run eval:injection` → the pinned promptfoo version,
so every run (manual / deploy gate / CI) is reproducible.

1. **Production promotion** — `scripts/promote-prod.mjs` runs the suite against
   the **production** Anthropic config, right after the prod build and before
   pushing `main`. A failing assertion aborts the promotion, so a prompt/firewall
   regression can't reach production.
2. **Weekly** — `.github/workflows/llm-injection-evals.yml` runs every Monday
   08:00 UTC (and on-demand via the Actions tab) to catch model-provider drift —
   Claude's behavior changing under us without a code change.

### Required secret

The weekly workflow needs **`ANTHROPIC_API_KEY`** stored as a GitHub secret —
add it as an **Environment secret** in the `Production` environment (the job
declares `environment: Production`), or as a repository secret.

**Why not pull it from Vercel?** `ANTHROPIC_API_KEY` is a *sensitive* variable
in Vercel, and Vercel never exposes sensitive values outside its own
deployments — `vercel env pull` and `vercel env run` both return it empty. For
the same reason, the prod-deploy gate (`scripts/promote-prod.mjs`) falls back to
the `ANTHROPIC_API_KEY` in the developer's local `.env.local` when the pulled
production env has it blank.

## Adding coverage

Add a route by dropping a prompt file in `prompts/` and a config in `configs/`
— `run-all.mjs` picks it up automatically. For auto-generated adversarial
attacks across many categories, see `promptfoo redteam` (generates hundreds of
cases → more API cost).

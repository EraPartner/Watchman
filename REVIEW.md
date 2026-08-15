# REVIEW.md — pre-change checklist for Watchman

Run before proposing, committing, or opening a PR. Encodes the review knowledge that
lives in the maintainer's head as a checklist so review catches issues automatically;
`AGENTS.md` / `CONTRIBUTING.md` carry the _why_. Every box below maps to a real gate in
this repo (git hooks, the `CI` workflow, or a documented invariant) — not a wish list.

## Secrets & safety

- [ ] No secrets in the diff. `.env` / `.env.local` / `.env.*.local`, `config.json`,
      `apps/*/config.json`, `cookies.txt`, `login_response.json`, `.tor-data/` are
      gitignored — they must stay uncommitted (secrets live only in `.env.local` +
      encrypted at rest in DuckDB via `WATCHMAN_MASTER_KEY`).
- [ ] `gitleaks git --staged --redact` clean (pre-commit runs it; CI `Secrets Scan` is the backstop).
- [ ] pino redaction left intact — tokens/PII are never logged; all inputs validated server-side (Zod).
- [ ] No files >1 MB and no leftover merge-conflict markers staged (pre-commit blocks both).

## Correctness & invariants

- [ ] Backend TS uses `undefined`, never `null`; ESM `import`/`export` only; functions over classes (service classes excepted).
- [ ] `apps/backend/openapi.yaml` edited? Ran `npm run generate:types` and committed the refreshed
      `apps/frontend/src/types/generated.ts` (CI `Verify Generated Artifacts` fails on drift).
- [ ] Security model unchanged: no auth/CSRF/rate-limiting added (ADR-017/ADR-025); the origin
      allow-list (CORS + WebSocket upgrade) stays the only browser gate.
- [ ] New/changed service = class extending `BaseService` (`checkHealth()` + `getStats()`),
      registered in `bootstrap/registerServices.ts`; verified health check, timeout/circuit-breaker,
      secret handling, and multi-instance behavior. Config goes through the `/config` API (DuckDB), not new env vars.
- [ ] Architectural decision recorded as a new append-only ADR in `docs/adr/` (next free number, from `template.md`).

## Tests & validation

- [ ] `npm run typecheck` (backend + frontend) green; desktop: `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`.
- [ ] `npm run lint:frontend` and `npm run lint:backend` green.
- [ ] `npm run test` (backend Vitest) green; `npm run test:frontend` for frontend-touching changes.
- [ ] `npm run build` (frontend + backend) succeeds for anything touching build/runtime surface.
- [ ] `npx audit-ci --config .audit-ci.json` clean (no un-allowlisted HIGH/CRITICAL deps).
- [ ] CI (`CI` workflow → required check `CI Complete`) expected green.

## Hygiene

- [ ] Signed commit (`commit.gpgsign=true`, SSH format) with a Conventional Commit message
      (`type(scope): subject`, enforced by the `commit-msg` hook) — what changed and why.
- [ ] Commit directly to `main` unless the task requests a branch; scope kept tight and unrelated cleanup logged as a follow-up.
- [ ] Behavior changed? Affected `docs/` pages updated with the `update-watchman-docs` skill and frontmatter dates bumped.

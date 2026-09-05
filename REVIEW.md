# REVIEW.md — pre-change checklist for Watchman

Run applicable development checks before proposing a change. Publication checks apply only in
the authorized publication environment. This checklist captures recurring review requirements;
`AGENTS.md` and `CONTRIBUTING.md` explain their purpose. Checks come from repository hooks, the
`CI` workflow, and documented invariants.

## Secrets & safety

- [ ] No secrets in the diff. `.env` / `.env.local` / `.env.*.local`, `config.json`,
      `apps/*/config.json`, `cookies.txt`, `login_response.json`, `.tor-data/` are
      gitignored — they must stay uncommitted (secrets live only in `.env.local` +
      encrypted at rest in DuckDB via `WATCHMAN_MASTER_KEY`).
- [ ] pino redaction left intact — tokens/PII are never logged; all inputs validated server-side (Zod).
- [ ] No files >1 MB and no leftover merge-conflict markers in the proposed diff (pre-commit blocks both).

## Correctness & invariants

- [ ] Backend TS uses `undefined`, never `null`; ESM `import`/`export` only; functions over classes (service classes excepted).
- [ ] `apps/backend/openapi.yaml` edited? Ran `npm run generate:types` and included the refreshed
      `apps/frontend/src/types/generated.ts` (CI `Verify Generated Artifacts` fails on drift).
- [ ] Security model unchanged: no auth/CSRF/rate-limiting added (ADR-017/ADR-025); the origin
      allow-list (CORS + WebSocket upgrade) stays the only browser gate.
- [ ] New/changed service = class extending `BaseService` (`checkHealth()` + `getStats()`),
      registered in `bootstrap/registerServices.ts`; verified health check, timeout/circuit-breaker,
      secret handling, and multi-instance behavior. Config goes through the `/config` API (DuckDB), not new env vars.
- [ ] Architectural decision recorded as a new append-only ADR in `docs/adr/` (next free number, from `template.md`).
- [ ] Behavior, API, architecture, service, configuration, security, package, build, deployment, or
      workflow changed? Ran `update-watchman-docs` after the implementation diff stabilized and
      updated every stale surface, or recorded why no documentation change was warranted.

## Tests & validation

Use the impact-based checks in `AGENTS.md` for development. Instruction-only and documentation-only
changes need relevant content and link checks; they do not require the application suite. For
applicable code changes, record the results of the following checks and explain omissions:

- [ ] Typecheck: `npm run typecheck` (backend + frontend); for desktop changes,
      `cd apps/desktop && npx tsc --noEmit -p tsconfig.json`.
- [ ] Lint: targeted lint or `npm run lint:frontend` and `npm run lint:backend` for affected workspaces.
- [ ] Tests: targeted tests, `npm run test` (backend Vitest), or `npm run test:frontend` for affected surfaces.
- [ ] Build: `npm run build` (frontend + backend) for changes requiring build verification under `AGENTS.md`.
- [ ] Dependency changes: `npx audit-ci --config .audit-ci.json` clean (no un-allowlisted HIGH/CRITICAL deps).
- [ ] Final validation ran after documentation and generated artifacts were synchronized; any
      implementation change made during validation triggered another documentation check.
- [ ] Required CI gates remain required for publication. Report actual `CI Complete` status when
      available; otherwise mark it unverified rather than predicting success.

## Development handoff

- [ ] Scope kept tight and unrelated cleanup logged as a follow-up.
- [ ] Regular local development leaves a reviewed working-tree diff for the LockBox `git-agent`,
      with changed files, validation results, skipped checks, and remaining risks. Do not stage,
      sign, commit, or push in that session. Cloud publication follows `AGENTS.md`.

## LockBox git-agent publication only

These checks apply only inside an explicitly authorized LockBox `git-agent` session. They do not
block review of an uncommitted working-tree diff or authorize publication from a development session.

- [ ] `gitleaks git --staged --redact` clean (pre-commit runs it; CI `Secrets Scan` is the backstop).
- [ ] Signed commit (`commit.gpgsign=true`, SSH format) with a Conventional Commit message
      (`type(scope): subject`, enforced by the `commit-msg` hook) explaining what changed and why.
- [ ] Commit directly to `main` unless the task requests a branch.

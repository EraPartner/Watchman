# AGENTS.md - Watchman

Shared guidance for coding agents in this repository. Tool-specific files should import or point
to this file instead of duplicating it. If `AGENTS.local.md` exists, read it before work because it
contains host-only setup.

The global working agreement applies (signing, publication, safety); this file lists
project-specific rules only.

## Project

Watchman is a self-hosted dashboard that polls home-lab services and exposes status and metrics.
It is read-only toward monitored services (ADR-032). It is an npm-workspaces monorepo using React 18, TypeScript, Vite, Tailwind and shadcn/ui;
Node, TypeScript and Fastify 5; REST and WebSocket transport; DuckDB configuration; Vitest; and
Electron. License: AGPL-3.0-only.

| Workspace            | Path             |
| -------------------- | ---------------- |
| `@watchman/frontend` | `apps/frontend/` |
| `@watchman/backend`  | `apps/backend/`  |
| desktop              | `apps/desktop/`  |

## Start with project knowledge

Search `docs/` before changing code. Treat docs as intent and code as current behavior.

- Architectural change: read `docs/adr/`; add the next numbered ADR instead of rewriting history.
- Service integration: read `docs/guides/adding-services.md` and the relevant
  `docs/integrations/` page, then use the `add-service` skill.
- Entry points: `docs/INDEX.md`, `docs/common-tasks.md`, `docs/architecture/index.md`, and
  `docs/reference/code-patterns.md`.

## Commands

```bash
npm run deps:ci:portable
npm run dev
npm run dev:backend
npm run dev:frontend
npm run build
npm run typecheck
npm run lint
npm run lint:backend
npm run test
npm run test:frontend
npm run test:e2e
npm run generate:types
npm run dist
# from a workspace directory:
npx vitest run src/path/to/x.test.ts
npx vitest run --testNamePattern="name"
```

## Provider and host behavior

These obligations are tracked here because Codex does not auto-load `AGENTS.local.md` when this
root file exists. `AGENTS.local.md` may add machine-specific convenience, but it cannot weaken or
replace these rules.

- The repository does not provide an agent container or synchronize provider state.
- Use browser tooling available in the current client for visual review. Report visual checks
  as skipped when no suitable tool is available. For every agent, `npm run typecheck` and the
  relevant build/test commands are authoritative; do not skip them because editor or Language
  Server Protocol diagnostics appear clean.

## Architecture and invariants

- Backend entry: `apps/backend/src/index.ts`.
- Each monitored service extends `BaseService`, implements `checkHealth()` and `getStats()`, and is
  registered through `bootstrap/registerServices.ts` and `ServiceLifecycle`.
- Reuse transport, cache, circuit-breaker, and scheduler code under `apps/backend/src/infra/`.
- Service and multi-instance configuration belongs in the DuckDB store through `/config` or the
  UI. A legacy `WATCHMAN_SERVICES_CONFIG` value is imported once into an empty store and then ignored.
- `apps/backend/openapi.yaml` is the API source of truth. After changing it, run
  `npm run generate:types`. Until the client migration is complete, also keep
  `apps/frontend/src/services/apiClient/types.ts` aligned.
- Backend uses ES2022+ ESM and `undefined` rather than `null`. Prefer functions; service classes are
  the deliberate exception.
- Frontend uses functional components, React Query, React Router v7, Tailwind, and
  `class-variance-authority`. Its TypeScript configuration is intentionally relaxed.

## Security model

This is a single-user trusted-network application. It intentionally has no authentication, CSRF
protection, or rate limiting; see ADR-017 and ADR-025. Do not expose the backend outside the trusted
network. Preserve the shared HTTP and WebSocket origin allowlist. Keep secrets in `.env.local` and
encrypted in DuckDB. Never log tokens or personal data; preserve the configured Pino secret
redaction. Validate every external input with server-side Zod schemas. Use least-privilege service
configuration, and audit new dependencies before adding them.

## Required synchronization and verification

- Before implementation, search the relevant project documentation and verify it against code.
- During an API change, update OpenAPI and route docs with the implementation, generate types, keep
  the hand-maintained client types aligned, and state compatibility.
- Once the implementation diff is stable and before final validation, use the
  `update-watchman-docs` skill for any behavior, API, architecture, service, configuration,
  security, package, build, or workflow change that could make project knowledge stale. Change
  size does not determine whether documentation is required.
- Update every affected documentation surface, or explicitly report why no documentation change
  is warranted. Before any direct `docs/` edit, read `docs/AGENTS.md`.
- After documentation and generated files are synchronized, run the checks appropriate to the
  changed surfaces below, plus applicable generated-artifact and documentation checks. If
  validation changes the implementation, repeat the documentation check. Instruction-only and
  documentation-only edits need relevant content and link checks, not the application suite.
- Service change: verify health, timeout, retry, circuit-breaker behavior, secret handling, and
  multi-instance behavior.
- Isolated edit: targeted test and lint.
- Cross-module edit: targeted tests, workspace lint, and typecheck.
- Security, persistence, or destructive edit: tests, lint, typecheck, build, and focused safety
  checks.

Keep scope focused. Finish with changed files, checks run, skipped checks, residual risk, and
follow-ups. When the task authorizes a local commit, commit directly to `main` unless the user asks
for a branch.

## Commit hooks

`.githooks/pre-commit` runs `npx lint-staged` (config: `lint-staged.config.mjs`). It runs
`eslint --fix` on staged backend and frontend sources and `prettier --write` on staged sources,
JSON, YAML, CSS, HTML, and Markdown, then adds the results to the commit. A commit can therefore
change staged content, including Markdown under `docs/`. Review `git show HEAD` after committing. `.githooks/pre-push` runs the heavier typecheck and test gate. Do not bypass the
hooks with `SKIP_HOOKS=1` or `git commit --no-verify` unless the user asks.

Create a session note in `docs/` only when it adds durable decisions, rationale, unresolved issues,
or operational lessons that are not already captured in the updated project documentation, or
when the user requests one. Do not duplicate the change summary merely because multiple files or
modules changed. Follow `docs/AGENTS.md` and use the `update-watchman-docs` skill for the note.

## Claude Code notes

Project skills are maintained in `.agents/skills/`. The entries under `.claude/skills/` defer to
those same canonical instructions.

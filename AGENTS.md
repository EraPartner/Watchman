# AGENTS.md - Watchman

Shared guidance for coding agents in this repository. Tool-specific files should import or point
to this file instead of duplicating it. If `AGENTS.local.md` exists, read it before work because it
contains host-only setup.

## Project

Watchman is a self-hosted dashboard that polls home-lab services and exposes status, metrics, and
controls. It is an npm-workspaces monorepo using React 18, TypeScript, Vite, Tailwind and shadcn/ui;
Node, TypeScript and Fastify 5; REST and WebSocket transport; DuckDB configuration; Vitest; and
Electron. License: AGPL-3.0-only.

| Workspace            | Path             |
| -------------------- | ---------------- |
| `@watchman/frontend` | `apps/frontend/` |
| `@watchman/backend`  | `apps/backend/`  |
| desktop              | `apps/desktop/`  |
| shared               | `packages/*`     |

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

- In the devcontainer, Codex uses isolated container state. Codex authentication and configuration
  do not synchronize with the host. Never copy `~/.codex/auth.json` into the container. Treat
  changes under container `~/.codex/` as ephemeral and report them before the session ends; tracked
  repository files under `.agents/` and `.codex/` persist through the workspace mount.
- Codex browser tooling is the supported replacement for Claude's Playwright plugin. There is no
  Codex TypeScript-LSP plugin in this project; `npm run typecheck` and the relevant build/test
  commands are the authoritative diagnostics and must not be skipped because editor diagnostics
  appear clean.

## Architecture and invariants

- Backend entry: `apps/backend/src/index.ts`.
- Each monitored service extends `BaseService`, implements `checkHealth()` and `getStats()`, and is
  registered through `bootstrap/registerServices.ts` and `ServiceLifecycle`.
- Reuse transport, cache, circuit-breaker, and scheduler code under `apps/backend/src/infra/`.
- Service and multi-instance configuration belongs in the DuckDB store through `/config` or the
  UI. Legacy `{SERVICE}_{N}_*` variables are imported once and then ignored.
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
encrypted in DuckDB. Never log tokens or personal data; preserve Pino redaction.

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
- Run final tests, lint, typecheck, build, generated-artifact checks, and documentation validation
  after documentation and generated files are synchronized. If validation changes the
  implementation, repeat the documentation check.
- Service change: verify health, timeout, retry, circuit-breaker behavior, secret handling, and
  multi-instance behavior.
- Isolated edit: targeted test and lint.
- Cross-module edit: targeted tests, workspace lint, and typecheck.
- Security, persistence, or destructive edit: tests, lint, typecheck, build, and focused safety
  checks.
- Explain destructive or irreversible commands and get confirmation first.

Keep scope focused. Finish with changed files, checks run, skipped checks, residual risk, and
follow-ups. Commit directly to `main` unless the user asks for a branch.

Validate every external input with server-side Zod schemas. Use least-privilege service
configuration, preserve the configured Pino secret redaction, and audit new dependencies before
adding them.

At the end of a substantial work session, summarize the work as an Obsidian note in `docs/` for
the project vault. A session is substantial when it changes multiple modules or documentation
surfaces, or changes architecture, API contracts, security, persistence, service integrations,
configuration workflows, or build/deployment behavior. Skip the note for isolated mechanical or
comment-only edits unless the user requests one. Follow `docs/AGENTS.md` and use the
`update-watchman-docs` skill for the note.

## Cloud sessions

Run `bash .codex/cloud/setup.sh` as the Codex cloud environment setup command. Keep cloud secrets
disposable and non-production. Cloud sessions cannot validate host containers, macOS integration,
hardware-backed signing, or local service state; report those checks as skipped and leave them for
a local session. In cloud sessions, do not publish with shell Git commands, configure Git
credentials, or create a pull request with `gh`. The platform-managed **Open pull request** action
may create a pull request, and the connected GitHub integration may update the same branch for
pull-request-linked follow-ups. When the user explicitly requests it, that integration may merge
the pull request after all required checks and approvals pass and no blocking review remains. Do
not use an admin bypass or directly update a default or protected branch outside that approved
merge.

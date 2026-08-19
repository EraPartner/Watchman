# Contributing to Watchman

Watchman is primarily solo-maintained, but it's open source (AGPL-3.0-only) and
contributions — bug reports, fixes, new service integrations — are welcome.
This guide is also the checklist for future-me. The authoritative design docs
live in [`docs/`](./docs/) (start at [`docs/INDEX.md`](./docs/INDEX.md));
`docs/` is intent, the code is truth — verify against the code.

## Prerequisites

- **Node.js 22** — pinned in [`.nvmrc`](./.nvmrc) / [`.node-version`](./.node-version).
  With `nvm`: `nvm use`. The `engines` field requires `node >=22`, `npm >=10`.
- **npm** (workspaces) — this is an npm monorepo; do not use yarn/pnpm.

## Getting started

```bash
git clone git@github.com:EraPartner/Watchman.git
cd Watchman
nvm use                 # or ensure Node 22+
npm run deps:ci:portable # verifies the Git pin; installs root, backend, and frontend; wires hooks

# Backend + frontend env (never commit these)
cp apps/backend/.env.example  apps/backend/.env.local
cp apps/frontend/.env.example apps/frontend/.env.local   # if present

npm run dev             # backend (:3001) + frontend (Vite), concurrently
```

Service configuration (including multi-instance) lives in the DuckDB config
store and is managed through the `/config` API or the UI — not env vars. Legacy
`{SERVICE}_*` env vars are imported once on first boot, then ignored.

## Project layout

| Workspace            | Path             |
| -------------------- | ---------------- |
| `@watchman/frontend` | `apps/frontend/` |
| `@watchman/backend`  | `apps/backend/`  |
| desktop (Electron)   | `apps/desktop/`  |
| shared packages      | `packages/*`     |

See [`docs/architecture/index.md`](./docs/architecture/index.md) for the design,
data flow, and the service-integration model.

## Everyday commands (from repo root)

```bash
npm run dev            # backend + frontend
npm run build          # build both
npm run typecheck      # tsc (backend + frontend)
npm run lint           # eslint (frontend); lint:backend for backend
npm run test           # backend tests (vitest); test:frontend / test:e2e
npm run format         # prettier across the repo
npm run generate:types # openapi.yaml -> frontend generated types
```

## Code style

Style is enforced by ESLint + Prettier — let the tools format; don't hand-format.

- **Backend (TS):** ES2022+ ESM (`import`/`export` only). **Never use `null` — use
  `undefined`.** Prefer functions over classes (service classes are the deliberate
  exception). Structured JSON logging with PII redaction — keep redaction intact.
- **Frontend (TS/React):** functional components + hooks; React Query for server
  state; Tailwind + `class-variance-authority`; shadcn/ui. Path alias `@/*`.

Patterns and conventions: [`docs/reference/code-patterns.md`](./docs/reference/code-patterns.md).

## Git hooks

`npm run deps:ci:portable` runs `scripts/setup-git-hooks.mjs` through npm's `prepare` lifecycle, which points
`core.hooksPath` at the version-controlled `.githooks/` directory (the same
mechanism Vision and VaultLens use — no husky). Re-run by hand with
`npm run hooks:setup`.

- **pre-commit** → scans staged changes for secrets with
  [gitleaks](https://github.com/gitleaks/gitleaks), blocks leftover
  merge-conflict markers and >1 MB files (`ALLOW_BIG_FILES=1` to override), then
  runs `lint-staged` (ESLint `--fix` + Prettier on **staged files only**).
- **commit-msg** → `commitlint` enforces Conventional Commits (see below).
- **pre-push** → `npm run typecheck` (backend + frontend + desktop) and the
  backend test suite (`SKIP_TESTS=1` / `SKIP_TYPECHECK=1` to skip individually).

The secret scan needs the gitleaks binary locally (`brew install gitleaks`); if
it's missing the hook warns and skips — CI's gitleaks job is the backstop.

Hooks can be bypassed in a pinch with `--no-verify`, but CI runs the same checks,
so a bypassed commit will just fail later.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`
— enforced by the `commit-msg` hook (config: `commitlint.config.mjs`).

Types in use: `feat`, `fix`, `chore`, `docs`, `refactor`, `build`, `perf`, `test`,
plus scoped variants like `feat(backend):`, `feat(desktop):`, `chore(security):`.

## Pull requests

1. Branch off `main` (don't commit to `main` directly).
2. Keep the change focused; log unrelated cleanup as a follow-up rather than folding it in.
3. Make sure `npm run typecheck`, `npm run lint`, and tests pass locally.
4. Update affected [`docs/`](./docs/) pages. For an **API change**, update
   [`apps/backend/openapi.yaml`](./apps/backend/openapi.yaml) and run
   `npm run generate:types`. For an **architectural decision**, add an ADR under
   [`docs/adr/`](./docs/adr/) (next free number; append-only; see `template.md`).
5. Open the PR and fill in the template. CI must be green.

## Adding a service integration

A new service is a class extending `BaseService` (implements `checkHealth()` +
`getStats()`), registered in `bootstrap/registerServices.ts`. Read
[`docs/integrations/`](./docs/integrations/) and
[`docs/guides/`](./docs/guides/) first — there's a documented procedure for
health checks, polling, timeouts/circuit-breaker behavior, and secret handling.

## Security

Watchman has a deliberate **trusted-network, single-user** security model — see
[`SECURITY.md`](./SECURITY.md) before touching auth, CORS, the origin allow-list,
or secret handling. Never commit secrets; they belong only in `.env.local`
(gitignored) and encrypted at rest in DuckDB.

# CLAUDE.md — Watchman

Agent guide and the single source of truth for working in this repo. Host-specific setup (the
devcontainer config-sync step) lives in the gitignored `CLAUDE.local.md` alongside this file.

## Project

Watchman = self-hosted service-monitoring dashboard. Polls 14+ home-lab service types (Bitcoin
node, IPFS, qBittorrent, Tor, AlbyHub, Synology, AdGuard, Homebridge, Roon, Philips Hue,
Raspberry Pi, Mac Mini, router, …) and shows live status, metrics, and controls. License AGPL-3.0-only.

Stack: React 18 + TypeScript + Vite + Tailwind + shadcn/ui (frontend) · Node + TypeScript +
Fastify 5 (backend; no auth — trusted-network single-user, see ADR-017/ADR-025) · REST +
WebSocket (real-time) · DuckDB config store · Vitest · Electron desktop. npm-workspaces
monorepo:

| Workspace            | Path             |
| -------------------- | ---------------- |
| `@watchman/frontend` | `apps/frontend/` |
| `@watchman/backend`  | `apps/backend/`  |
| desktop (Electron)   | `apps/desktop/`  |
| shared               | `packages/*`     |

Filtered runs: `npm run <script> --workspace=apps/backend` (or `apps/frontend`).

## Before any task

1. **Search the `docs/` KB first** — authoritative for architecture decisions, conventions,
   and service-integration specs. `docs/` = intent, code = truth; verify against code.
2. Check `docs/adr/` before architectural changes (append-only; new ADR supersedes, template at
   `docs/adr/template.md`; use the next free number).
3. When adding/changing a service, read `docs/integrations/` first (the `add-service` skill in
   `.claude/skills/` carries the full procedure and loads on demand).

Entry points: `docs/INDEX.md` · `docs/common-tasks.md` · `docs/architecture/index.md` ·
`docs/reference/code-patterns.md`.

### `docs/` map

`adr/` decisions · `api/` REST contracts · `architecture/` design & data flow · `components/`
React docs · `features/` (multi-instance, real-time) · `guides/` (deploy, adding services) ·
`integrations/` per-service specs · `security/` (auth, rate-limit, IP control) · `performance/`
(caching) · `reference/` (env vars, patterns, error codes, scripts) · `testing/` · `glossary.md` ·
`troubleshooting.md`.

## Commands (run from repo root)

```bash
npm install
npm run dev                       # backend + frontend (concurrently)
npm run dev:backend | dev:frontend
npm run build                     # build:backend + build:frontend
npm run typecheck                 # backend + frontend tsc
npm run lint                      # frontend lint (lint:backend for backend)
npm run test                      # backend tests (vitest); test:frontend / test:e2e for frontend
npm run format                    # prettier across workspaces
npm run generate:types            # openapi.yaml -> apps/frontend/src/types/generated.ts
npm run dist                      # build + package Electron desktop (apps/desktop)
npm run electron:dev | electron:prod
# single test (from a workspace dir):
npx vitest run src/path/to/x.test.ts
npx vitest run --testNamePattern="name"
```

## Architecture (verified layout)

**Backend** (`apps/backend/`, TypeScript ESM, `type: module`, builds to `dist/index.js`):

- `src/index.ts` — entry.
- `src/domain/` — `BaseService.ts` (base class every service extends), `ServiceRegistry.ts`
  (registers + routes all service instances), `health.ts`, `services/` (per-service classes).
- `src/infra/` — `http`, `ssh`, `snmp`, `net`, `gpio`, `roon`, `db`, `cache`, `circuitBreaker`
  (prevents hammering failing services), `scheduler` (background polling).
- `src/{application,bootstrap,core,config,transport,types}/` — app wiring, startup, transport
  (Fastify HTTP + WebSocket), shared types.
- `openapi.yaml` — OpenAPI 3.1 spec (documentation; no Swagger UI is served).

**Frontend** (`apps/frontend/`): `src/main.tsx` entry · `src/components/` (shadcn/ui in
`components/ui/`) · `src/hooks/` · `src/pages/` · `src/services/ApiClient.ts`.

A new service = a class extending `BaseService` (implements `checkHealth()` + `getStats()`),
created in `bootstrap/registerServices.ts` and brought up by `ServiceLifecycle`. Service
config (incl. multi-instance) lives in the DuckDB config store via the `/config` API; legacy
`{SERVICE}_*` env vars are imported once on first boot, then ignored.

## Conventions (project-specific)

- **Backend (TS):** ES2022+ ESM, `import`/`export` only. **Never use `null` — use `undefined`.**
  Prefer functions over classes (service classes are the deliberate exception). No comments unless
  necessary. Structured JSON logging with PII redaction; global error handler with production-safe
  stack traces.
- **Frontend (TS/React):** `strict: false` (relaxed) in `tsconfig.app.json`; path alias `@/*` →
  `apps/frontend/src/*`; functional components + hooks; React Query for server state; React Router
  v6; Tailwind + `class-variance-authority`; shadcn/ui. Lint: `no-unused-vars` warn (prefix `_`).
- **API:** RESTful Fastify 5, OpenAPI-first (`apps/backend/openapi.yaml`), standardized response
  envelope. No auth/CSRF/rate-limiting by design (single-user, trusted network — ADR-017/ADR-025);
  browser access is gated by an origin allow-list (desktop `watchman://` + loopback +
  `CORS_ALLOWED_ORIGINS`), shared by CORS and the WebSocket upgrade.
- **Docs:** conventions load path-scoped from `.claude/rules/docs.md` when touching `docs/**`.

Domain terms (full: `docs/glossary.md`): Service · Service Instance (multiple per type) ·
Health Check (online/offline ping) · Stats (per-service metrics) · ServiceRegistry · Circuit
Breaker · Multi-Instance.

## After code changes (mandatory)

Update the affected `docs/` pages before finishing — invoke the `watchman-kb-updater` subagent
(`.claude/agents/watchman-kb-updater.md`) before marking work complete; if the API changed, update
`apps/backend/openapi.yaml` and run `npm run generate:types`. Bump frontmatter dates.

## Gotchas

- **`openapi.yaml` is the API source of truth** — after changing it run `npm run generate:types`
  to refresh `apps/frontend/src/types/generated.ts`. Note: the API client currently hand-maintains
  its own types in `src/services/apiClient/types.ts`; keep both in sync (follow-up: migrate the
  client onto the generated types).
- **Origin allow-list, not CSRF** — browser requests are gated by origin (CORS + WS upgrade).
  A web deployment on a non-loopback origin needs `CORS_ALLOWED_ORIGINS` set or it will be blocked.
- **Service config lives in DuckDB** (manage via `/config` API or the UI). Legacy `{SERVICE}_{N}_*`
  env vars are migrated once on first boot, then ignored.

## Verification (scale to risk)

- low = targeted test/lint · medium = targeted tests + workspace lint + `typecheck` · high
  (security / persistence / destructive) = tests + lint + typecheck + build + focused security checks.
- Service-integration change → verify health check, timeout/circuit-breaker behavior, secret
  handling, multi-instance implications.
- API change → update `openapi.yaml` + `generate:types` + route docs; note breaking vs non-breaking.
- Destructive/irreversible → explicit plan + user confirmation first.

Keep scope tight (log follow-ups, don't fold in unrelated cleanup). Exclude build artifacts,
`node_modules/`, `.env*`/secrets, `.git/` internals unless the task needs them. Finish with:
changed files, checks run, residual risk, follow-ups.

## Environment

Backend env in `apps/backend/.env.local` (from `.env.example`); frontend in
`apps/frontend/.env.local`. Never commit secrets. Backend env surface (`config/env.ts`):
`NODE_ENV`, `BACKEND_V2_PORT` (3001), `BACKEND_V2_HOST` (0.0.0.0), `LOG_LEVEL`, `DATA_DIR`,
`WATCHMAN_MASTER_KEY` (required in practice — encrypts service secrets at rest),
`CORS_ALLOWED_ORIGINS` (extra browser origins), `TRUST_PROXY` (default false). Service config
lives in the DuckDB store, not env. Full reference: `docs/reference/environment-variables.md`.

## Security

**Model: single-user on a trusted network — no auth/CSRF/rate-limiting by design
(ADR-017/ADR-025).** Anyone who can reach the port can read and reconfigure; don't expose the
backend beyond the trusted network (bind/firewall accordingly). Browser cross-origin access is
gated by the origin allow-list (CORS + WebSocket upgrade). Secrets only in `.env.local`
(gitignored) and encrypted at rest in DuckDB; never log tokens/PII (pino redaction is configured —
keep it intact). Validate all inputs (server-side Zod). Least-privilege service configs. Audit
new dependencies.

## Workflow

- **New feature / architectural decision:** state scope + assumptions before coding; record decisions
  as a new ADR in `docs/adr/` (next free number; follow `docs/adr/template.md`; append-only).
- **Hard bug:** check `docs/adr/` + `docs/troubleshooting.md` before reading code.
- **Session end:** summarize the session's work as an Obsidian note in `docs/` for the vault.

## When stuck

`docs/troubleshooting.md` → `docs/reference/error-codes.md` → ask rather than guess.

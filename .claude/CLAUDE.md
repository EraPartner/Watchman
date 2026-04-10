# Watchman — Claude Code Context

**Watchman** — self-hosted service monitoring dashboard. Polls 14+ home-lab service types (Bitcoin node, IPFS, qBittorrent, Tor, AlbyHub, Synology, AdGuard, Homebridge, Roon, Philips Hue, Raspberry Pi, Mac Mini, Router, more). Unified React dashboard: live status, metrics, service controls.

`docs/` — Obsidian knowledge base. Authoritative source for architecture decisions, conventions, project context.

---

## Mandatory Behaviors

> Apply to every task, no exceptions.

1. **Obsidian skill first** — Use `obsidian` skill (`obsidian:obsidian-markdown`, `obsidian:obsidian-cli`) for all vault reads/writes/searches. Raw `Read`/`Grep`/`Glob` on `docs/` — fallback only when skill can't cover it. Skill preserves wikilink integrity, frontmatter, cross-references that raw access breaks.

2. **KB updater last** — After any code change, invoke `watchman-kb-updater` agent before marking task complete. Mandatory, not optional.

---

## Before Starting Any Task

1. Read `docs/INDEX.md` — project overview, quick-reference links
2. Check `docs/adr/index.md` — decisions relevant to area being changed
3. Check relevant section index (e.g. `docs/integrations/index.md` when adding service)
4. Verify against actual code — docs reflect intent, code is source of truth

---

## Knowledge Base Structure

```
docs/
├── adr/            ← Architecture Decision Records (ADR 001–012) — read before architectural changes
├── api/            ← REST API endpoint documentation
├── architecture/   ← System design diagrams and data flow
├── components/     ← Frontend React component and hook documentation
├── features/       ← Feature documentation (multi-instance, real-time, etc.)
├── guides/         ← Setup, deployment, contributing, adding services
├── integrations/   ← Per-service integration docs (14+ services)
├── security/       ← Auth, rate limiting, IP control docs
├── performance/    ← Caching, request optimization docs
├── reference/      ← Environment variables, code patterns, error codes, scripts
├── testing/        ← Testing strategies and patterns
├── INDEX.md        ← KB home — start here
└── common-tasks.md ← Task-oriented quick reference
```

**ADR numbering:** Next is 013. Filename: `013-short-title.md`. Template at `docs/adr/template.md`. ADRs capture decisions affecting architecture, API design, security, or tech choices.

---

## Architecture

### Backend (Node.js/Express, ESM)

- **Service Factory** — All services registered in `serviceFactoryConfig.js`, never instantiated directly elsewhere
- **ServiceManager** — Central orchestration; all service calls route through it
- **Circuit Breaker** — Wraps all external calls (`apps/backend/utils/circuitBreaker.js`)
- **Multi-instance** — Numbered env vars: `SERVICE_1_URL`, `SERVICE_2_URL`, etc.
- **Auth** — JWT in HTTP-only cookies + double-submit CSRF
- **Rate limits** — Health 100/15min · Auth 5/15min · Control 20/15min · General 100/15min

### Frontend (React 18, TypeScript)

- React Query for all server state — never duplicate into client stores
- Tailwind CSS + shadcn/ui
- Components in `apps/frontend/src/components/PascalCase.tsx`

---

## Code Style

**Backend:**
- ES2022+, ESM (`import`/`export`) — no CommonJS
- `async/await` everywhere async
- **Never `null`** — use `undefined` for optional values
- No comments unless logic genuinely non-obvious
- All services implement: `checkHealth()`, `getStats()`, optional `performAction()`

**Frontend:**
- Functional components + hooks only — no class components
- PascalCase components, `camelCase` functions/hooks (prefix hooks with `use`)
- Strict TypeScript

**Both:**
- No premature abstractions — three similar lines beats wrong abstraction
- No error handling for impossible cases — trust framework guarantees
- Validate only at system boundaries (user input, external APIs)
- Delete removed code cleanly — no backwards-compat shims
- Never add docstrings/comments to unchanged code
- Fix underlying code, not tests

---

## Commands

```bash
npm run dev           # Start frontend + backend concurrently
npm run dev:frontend  # Frontend only (Vite, port 5173)
npm run dev:backend   # Backend only (Express, port 3000)
npm run build         # Build both
npm run test          # Run all tests
npm run lint          # Lint all workspaces
npm run lint:fix      # Auto-fix lint issues
npm run format        # Format with Prettier
```

---

## Key Files

| Purpose | Path |
|---------|------|
| Backend entry | `apps/backend/server.js` |
| Service classes | `apps/backend/services/*.js` |
| Service factory | `apps/backend/serviceFactoryConfig.js` |
| ServiceManager | `apps/backend/services/ServiceManager.js` |
| Circuit breaker | `apps/backend/utils/circuitBreaker.js` |
| Middleware | `apps/backend/middleware/*.js` |
| Routes | `apps/backend/routes/*.js` |
| Config | `apps/backend/config.js` |
| OpenAPI spec | `apps/backend/openapi.yaml` |
| Frontend entry | `apps/frontend/src/main.tsx` |
| Components | `apps/frontend/src/components/*.tsx` |
| Hooks | `apps/frontend/src/hooks/*.ts` |
| API client | `apps/frontend/src/services/ApiClient.ts` |
| Env vars template | `apps/backend/.env.example` |

---

## Documentation Conventions

- Every doc has YAML frontmatter: `title`, `type`, `status`, `date`, `tags`, `description`, `aliases`
- Internal links use Obsidian wiki-link format: `[[docs/path/to/file|Display Name]]`
- Code references: `[[apps/backend/services/ServiceName.js]]`
- After adding feature/service/endpoint: update relevant index doc

---

## Workflow Reference

**New feature or non-trivial task:**
> Read `docs/INDEX.md`, relevant ADRs in `docs/adr/`, related docs in `docs/architecture/`. State understanding of what's being built. Ask three most important questions before writing code.

**Significant architectural decision:**
> Write ADR in `docs/adr/` following `docs/adr/template.md`. Document: decision, rationale, alternatives considered, revisit criteria.

**Hard bug:**
> Before reading code, check `docs/adr/` for decisions related to affected system and `docs/troubleshooting.md` for known issues.

**Session end:**
> Summarize: what was built, decisions made, context useful for future sessions. Format as Obsidian note for vault.
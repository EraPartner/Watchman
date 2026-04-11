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

## Key Files

| Purpose | Path |
|---------|------|
| Backend entry | `apps/backend/server.js` |
| Service factory | `apps/backend/serviceFactoryConfig.js` |
| ServiceManager | `apps/backend/services/ServiceManager.js` |
| Circuit breaker | `apps/backend/utils/circuitBreaker.js` |
| OpenAPI spec | `apps/backend/openapi.yaml` |
| Frontend entry | `apps/frontend/src/main.tsx` |
| API client | `apps/frontend/src/services/ApiClient.ts` |
| Env vars template | `apps/backend/.env.example` |

**Key references:**
- `docs/architecture/index.md` — stack, service patterns, data flow
- `docs/reference/scripts.md` — all `npm run` commands
- `docs/common-tasks.md` — task quick reference
- `docs/reference/code-patterns.md` — canonical implementation patterns

---

## Documentation Conventions

- Every doc has YAML frontmatter: `title`, `type`, `status`, `date`, `tags`, `description`, `aliases`
- Internal links use Obsidian wiki-link format: `[[docs/path/to/file|Display Name]]`
- After adding feature/service/endpoint: update relevant index doc

---

## Workflow Reference

**New feature:** Read `docs/INDEX.md` → relevant ADRs → architecture docs. State understanding, ask three key questions before writing code.

**Architectural decision:** Write ADR in `docs/adr/` following `docs/adr/template.md`. Next ADR number: 013.

**Hard bug:** Check `docs/adr/` + `docs/troubleshooting.md` before reading code.

**Session end:** Summarize as Obsidian note for vault.
# Watchman — Claude Code Context

This is a self-hosted service monitoring dashboard. The `docs/` directory is an Obsidian knowledge base — treat it as the authoritative source for architecture decisions, conventions, and project context before touching any code.

> **IMPORTANT — Obsidian Skill First:** Always use the `obsidian` skill (e.g. `/obsidian:obsidian-markdown`, `/obsidian:obsidian-cli`) to read, search, and update the `docs/` knowledge base. Direct file reads with the Read/Glob/Grep tools are only a fallback when the Obsidian skill cannot fulfill the operation. The skill maintains wikilink integrity, frontmatter, and cross-reference consistency that raw file access does not.

## Knowledge Base Structure

```
docs/
├── adr/           ← Architecture Decision Records (why decisions were made)
├── api/           ← REST API endpoint documentation
├── architecture/  ← System design diagrams and data flow
├── components/    ← Frontend React component and hook documentation
├── features/      ← Feature documentation (multi-instance, real-time, etc.)
├── guides/        ← Setup, deployment, contributing, adding services
├── integrations/  ← Per-service integration docs (14+ services)
├── security/      ← Auth, rate limiting, IP control docs
├── performance/   ← Caching, request optimization docs
├── reference/     ← Environment variables, code patterns, error codes, scripts
├── testing/       ← Testing strategies and patterns
├── INDEX.md       ← KB home — start here for any task
└── common-tasks.md← Task-oriented quick reference
```

**Key mapping from tweet conventions to this vault:**
- "Context/Architecture" → `docs/architecture/`
- "Context/Decisions" → `docs/adr/` (ADR 001–012 are all here)
- "Context/Debugging" → `docs/troubleshooting.md` + `docs/reference/error-codes.md`
- "Project briefing" → `docs/INDEX.md`

## How to Use This Vault

### Before Starting Any Task

1. Read `docs/INDEX.md` for project overview and quick-reference links
2. Check `docs/adr/index.md` for decisions relevant to the area you're changing
3. Check the relevant section index (e.g. `docs/integrations/index.md` when adding a service)
4. Verify against actual code — docs reflect intent, code is source of truth

### Project Kickoff Workflow

When starting a new feature or non-trivial task, run this prompt first:

> Read `docs/INDEX.md`, the relevant ADRs in `docs/adr/`, and any related docs in `docs/architecture/`. Tell me what you understand about what I'm building and ask me the three most important questions before we write any code.

### Decision Capture Workflow

After any significant architectural decision during a session:

> We just decided to [DESCRIBE DECISION]. Write an ADR for `docs/adr/` following the template at `docs/adr/template.md`. Document what we decided, why we chose this approach, what alternatives we considered, and when this should be revisited.

ADRs are named `NNN-short-title.md` (next sequential number after 012).

### Knowledge Extraction Workflow

At the end of any significant session:

> Summarize what we built, what decisions we made, and what you learned about the codebase that would be useful context for future sessions. Format this as a note I can add to the Obsidian vault.

### Debugging Intelligence Workflow

When hitting a difficult bug:

> I'm debugging [BUG DESCRIPTION]. Before looking at the code, check `docs/adr/` for decisions related to [RELEVANT SYSTEM] and `docs/troubleshooting.md` for known issues. Then help me understand what might be causing this based on both the code and past decisions.

## Current Active Project

**Watchman v1.0** — Single active project. This is the whole repository.

- Goal: Self-hosted service monitoring dashboard for 14+ service types
- Status: Active development, feature-complete core, adding services and refinements
- Open areas: Adding new service integrations, performance optimizations, testing coverage

## Development Conventions

### Code Style

**Backend (Node.js/Express, ESM):**
- ES2022+, ESM modules (`import`/`export`)
- `async/await` for all async code
- **Never use `null`** — use `undefined` for optional values
- No comments unless the logic is genuinely non-obvious
- Service classes in `apps/backend/services/PascalCase.js`
- All services extend base pattern: `checkHealth()`, `getStats()`, optional `performAction()`

**Frontend (React 18, TypeScript):**
- Functional components with hooks only — no class components
- PascalCase for components, camelCase for functions/hooks (`useCamelCase`)
- React Query for all server state
- Tailwind CSS + shadcn/ui for styling
- Components in `apps/frontend/src/components/PascalCase.tsx`

### Architecture Patterns

- **Service Factory**: All services registered in `serviceFactoryConfig.js` — never instantiated directly
- **ServiceManager**: Central orchestration point — all service calls go through it
- **Circuit Breaker**: Wraps all external service calls in `apps/backend/utils/circuitBreaker.js`
- **Multi-instance**: Services use numbered env vars `SERVICE_1_URL`, `SERVICE_2_URL`, etc.
- **Auth**: JWT in HTTP-only cookies + double-submit CSRF pattern
- **Rate limits**: Health 100/15min, Auth 5/15min, Control 20/15min, General 100/15min

### Documentation Conventions

- **After any code changes, invoke the `watchman-kb-updater` agent before considering the task complete.** This is mandatory.
- Every doc has YAML frontmatter: `title`, `type`, `status`, `date`, `tags`, `description`, `aliases`
- Internal links use Obsidian wiki-link format: `[[docs/path/to/file|Display Name]]`
- Code references: `[[apps/backend/services/ServiceName.js]]`
- ADRs for any decision affecting architecture, API design, security, or tech choices
- After adding a feature/service/endpoint: update the relevant index doc

### Commands

```bash
npm run dev          # Start frontend + backend concurrently
npm run dev:frontend # Frontend only (Vite, port 5173)
npm run dev:backend  # Backend only (Express, port 3000)
npm run build        # Build both
npm run lint         # Lint all workspaces
npm run lint:fix     # Auto-fix lint issues
npm run test         # Run all tests
npm run format       # Format with Prettier
```

## Key File Locations

| Purpose              | Path                                          |
| -------------------- | --------------------------------------------- |
| Backend entry        | `apps/backend/server.js`                      |
| Service classes      | `apps/backend/services/*.js`                  |
| Service factory      | `apps/backend/serviceFactoryConfig.js`        |
| Middleware           | `apps/backend/middleware/*.js`                |
| Routes               | `apps/backend/routes/*.js`                    |
| Config               | `apps/backend/config.js`                      |
| OpenAPI spec         | `apps/backend/openapi.yaml`                   |
| Frontend entry       | `apps/frontend/src/main.tsx`                  |
| Components           | `apps/frontend/src/components/*.tsx`          |
| Hooks                | `apps/frontend/src/hooks/*.ts`                |
| API client           | `apps/frontend/src/services/ApiClient.ts`     |
| Circuit breaker      | `apps/backend/utils/circuitBreaker.js`        |
| Environment vars     | `apps/backend/.env.example`                   |

## Technical Preferences

- Prefer functional patterns over class-based where the language allows
- No premature abstractions — three similar lines is better than a wrong abstraction
- No error handling for scenarios that can't happen — trust framework guarantees
- Validate only at system boundaries (user input, external APIs)
- No backwards-compatibility shims for removed code — delete cleanly
- No docstrings or comments on code that wasn't changed
- Tests must not be modified to pass — fix the underlying code

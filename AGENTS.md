# AGENTS.md - Watchman Project Guidelines

This file provides guidelines for agentic coding agents working in this repository.

## Quick Start

1. **Read docs first** — Search the Obsidian KB (`docs/`) before touching code
2. **Follow conventions** — Match existing patterns; do not introduce new ones
3. **Write tests** — All new features and bug fixes need test coverage
4. **Update docs** — Call `watchman-kb-updater` after every code change
5. **Commit when asked** — Never commit unless the user explicitly requests it

## Agent Usage Rules

### Subagent-Only Usage

Agents are **specialized subagents** — each has a strict, narrow purpose. The main agent must delegate to the correct subagent for each task. Never use an agent outside its defined scope:

| Agent                        | Use For                                                          | Do NOT Use For                           |
| ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `senior-feature-engineer`    | Implementing new features, fixing bugs                           | Code review, refactoring, tests, commits |
| `refactoring-expert`         | Restructuring code, removing duplication, applying patterns      | New features, bug fixes, analysis, tests |
| `code-improvement-suggester` | Read-only code review, quality analysis, improvement suggestions | Actual code changes, refactoring, tests  |
| `test-generator`             | Writing unit/integration/e2e tests                               | Implementation, refactoring, analysis    |
| `intelligent-commit-writer`  | Creating git commits                                             | Git log, status, branches, pushing       |
| `watchman-kb-updater`        | Updating documentation after code changes                        | Code changes, analysis, any non-doc work |
| `watchman-kb-initialization` | Initial KB vault setup from scratch                              | Updating existing docs, code changes     |
| `explore`                    | Fast codebase exploration, finding files/patterns                | Code modification, analysis              |

### Knowledge Base Workflow

**Before making any code changes or architectural decisions, agents MUST learn about the codebase:**

1. **Search the Obsidian knowledge base first** using Obsidian MCP tools:
   - `mcp-obsidian_obsidian_simple_search` — Full-text search across all docs
   - `mcp-obsidian_obsidian_complex_search` — Query by tags, paths, frontmatter
   - `mcp-obsidian_obsidian_list_files_in_dir` — List docs in a specific folder
   - `mcp-obsidian_obsidian_get_file_contents` — Read specific doc files

2. **Check relevant documentation** — See the **Knowledge Base** section below for the full structure. Key entry points:
   - `docs/common-tasks.md` — Task-oriented quick reference (start here if you know what you want to do)
   - `docs/glossary.md` — Terminology with aliases and search tips
   - `docs/getting-started.md` — New developer onboarding map
   - `docs/adr/` — Architecture Decision Records (read before architectural changes)
   - `docs/api/` — API documentation (check before creating/modifying endpoints)
   - `docs/features/` — Feature docs (understand existing behavior)
   - `docs/integrations/` — Service integration specs (check before modifying services)
   - `docs/guides/` — How-to guides and patterns
   - `docs/reference/` — Code patterns, scripts, environment variables

3. **Cross-reference with code:**
   - After learning from docs, verify against actual code files
   - Use `explore` subagent for fast pattern matching in code
   - Use `read` and `glob` tools for specific file inspection

4. **Update after changes:**
   - Call `watchman-kb-updater` subagent after completing code changes
   - This keeps docs in sync with implementation

**Rationale:** The knowledge base contains architectural decisions, API contracts, service integration specs, and system diagrams. Skipping this step leads to duplicated work, inconsistent patterns, and broken contracts.

## Project Overview

Watchman is a full-stack monitoring dashboard for self-hosted services with:

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + JWT auth + OpenAPI/Swagger
- **Communication**: REST API + WebSocket for real-time updates
- **Package Manager**: npm workspaces
- **Testing**: Vitest
- **License**: AGPL-3.0-only

### Monorepo Structure

This is an npm workspaces monorepo with three packages:

| Package              | Path               | Description                 |
| -------------------- | ------------------ | --------------------------- |
| `@watchman/frontend` | `apps/frontend/`   | React frontend application  |
| `@watchman/backend`  | `apps/backend/`    | Node.js backend API         |
| `packages/shared/`   | `packages/shared/` | Shared utilities (reserved) |

When running filtered commands, use the workspace names:

```bash
npm run <script> --workspace=apps/frontend
npm run <script> --workspace=apps/backend
```

## Terminology

See `docs/glossary.md` for the complete glossary with aliases and search tips. Key terms:

- **Service**: An external self-hosted application that Watchman monitors (e.g., AdGuard Home, Bitcoin node, Tor relay).
- **Service Instance**: A specific deployment of a service type. Multiple instances of the same type are supported (e.g., multiple qBittorrent nodes).
- **Health Check**: A lightweight request to verify a service is responsive. Returns online/offline status.
- **Stats**: Detailed service-specific metrics (e.g., AdGuard query counts, Bitcoin block height).
- **ServiceManager**: Central backend class that manages all service instances and routes requests.
- **Circuit Breaker**: Pattern that prevents repeated calls to failing services.
- **Multi-Instance**: Support for running multiple nodes of the same service type via numbered environment variables.

## Build Commands

### Root Commands (from workspace root)

```bash
# Install dependencies
npm install

# Development
npm run dev                # Run both frontend and backend
npm run dev:frontend       # Frontend only (Vite on 5173)
npm run dev:backend        # Backend only (Express on 3001)

# Production start
npm run start              # Start both + open browser

# Build
npm run build              # Build frontend + backend
npm run build:frontend     # Frontend only
npm run build:backend      # Backend only

# Linting
npm run lint               # Lint all workspaces
npm run lint:fix           # Fix lint issues

# Formatting
npm run format             # Format all workspaces
npm run format:check       # Check formatting

# Testing
npm run test               # Run tests in all workspaces

# Maintenance
npm run clean              # Remove all node_modules
npm run setup              # Install dependencies
```

### Running a Single Test

```bash
# From apps/frontend directory
npx vitest run --testNamePattern="testName"
npx vitest run src/path/to/test.test.tsx
```

### Backend Build

```bash
# From apps/backend directory
npm run build              # Full build (validate env + bundle + copy assets)
npm run build:bundle       # esbuild bundle only
npm run copy:assets        # Copy config, openapi.yaml, api-docs.yaml
npm run validate-env       # Validate environment variables
npm run health-check       # Check if server is responding
```

### Security Checks

```bash
npm run security:check     # Audit + secrets scan
npm run security:secrets   # Scan for exposed secrets
npm run security:test      # Run security test script
```

## Code Style Guidelines

### TypeScript (Frontend)

- **TypeScript** with `strict: false` in `tsconfig.app.json` (relaxed strictness)
- Path alias: `@/*` maps to `apps/frontend/src/*`
- ES2020 target, ESNext modules
- React JSX transform (`react-jsx`)
- Bundler module resolution
- Use interfaces for props, state, and component definitions
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitAny`, `noFallthroughCasesInSwitch` are all `false` (relaxed)

### JavaScript/Node.js (Backend)

- **ES2022+** features, ESM modules (`"type": "module"`)
- Use `async/await` for all asynchronous code
- Use `import`/`export` syntax (no CommonJS)
- **Never use `null`** — use `undefined` for optional values
- Prefer functions over classes where possible (service classes are the exception)
- No comments unless absolutely necessary
- Keep code simple and maintainable

### React Components

- Functional components with hooks as default
- PascalCase for components, camelCase for functions/variables
- Use custom hooks for reusable stateful logic
- Follow single responsibility principle
- Implement proper prop validation with TypeScript
- Use React Query (`@tanstack/react-query`) for server state
- Use React Router v6 for routing

### Styling

- Tailwind CSS with `tailwind-merge` and `clsx`
- Use `class-variance-authority` for component variants
- shadcn/ui component library (`apps/frontend/src/components/ui/`)
- Follow mobile-first responsive design

### ESLint Rules

- `@typescript-eslint/no-unused-vars`: warn (prefix with `_` to suppress)
- `react-refresh/only-export-components`: warn
- `react-hooks/rules`: enforced

### Error Handling

- Implement Error Boundaries for component-level errors
- Use proper error states in data fetching
- Handle async errors in effects and event handlers
- Backend: structured JSON logging with PII redaction
- Backend: global error handler with production-safe stack traces
- Provide meaningful error messages to users

## Existing Agent Instructions

Load these from the Awesome MCP server using `awesome-copilot_load_instruction` **before** writing code in the relevant area:

- `nodejs-javascript-vitest.instructions.md` — Load before writing backend code
- `reactjs.instructions.md` — Load before writing frontend React components
- `performance-optimization.instructions.md` — Load when working on performance-critical paths

## Important Patterns

### Service Integration Pattern

Each service follows a standard pattern:

```javascript
class ServiceName {
  constructor(config) {
    this.name = "service-name";
    this.config = config;
    this.enabled = this.checkConfig();
  }

  checkConfig() {
    return !!(this.config.host && this.config.port);
  }

  async checkHealth() {
    // Lightweight ping - returns { status, timestamp, data? }
  }

  async getStats() {
    // Detailed metrics - returns { data, timestamp }
  }
}
```

Services are registered in `apps/backend/services/serviceFactoryConfig.js` and routes are generated dynamically via `apps/backend/routes/serviceFactory.js`.

### Testing Guidelines

- Write tests for all new features and bug fixes
- Cover edge cases and error handling
- Never modify original code to make testing easier
- Use `@testing-library/react` for component tests
- Vitest for test runner

### API Design

- RESTful endpoints in Express
- OpenAPI 3.0 specification (`apps/backend/openapi.yaml`)
- Swagger UI at `/api/docs`
- Proper HTTP status codes
- JWT authentication via HTTP-only cookies
- CSRF protection (double-submit cookie pattern)
- Tiered rate limiting per endpoint category
- Response standardization via `apiResponse.js` middleware

## Key File Locations

| Path                                    | Description                               |
| --------------------------------------- | ----------------------------------------- |
| `apps/frontend/src/`                    | React frontend source                     |
| `apps/frontend/src/components/`         | React components                          |
| `apps/frontend/src/hooks/`              | Custom React hooks                        |
| `apps/frontend/src/pages/`              | Page components                           |
| `apps/frontend/src/services/`           | API client services                       |
| `apps/backend/server.js`                | Backend entry point and route definitions |
| `apps/backend/config.js`                | Configuration management                  |
| `apps/backend/services/`                | Service integration classes               |
| `apps/backend/middleware/`              | Express middleware                        |
| `apps/backend/routes/serviceFactory.js` | Dynamic route generation                  |
| `apps/backend/openapi.yaml`             | OpenAPI specification                     |
| `apps/backend/utils/`                   | Utility functions                         |
| `packages/shared/`                      | Shared packages (if present)              |
| `docs/`                                 | Project knowledge base (Obsidian vault)   |
| `tools/`                                | Dev and maintenance scripts               |

## Knowledge Base

The project has a documentation knowledge base in `docs/` designed for Obsidian and AI agent usage.

### Structure

- `docs/INDEX.md` — Main entry point with dataview queries
- `docs/getting-started.md` — New developer onboarding
- `docs/common-tasks.md` — Task-oriented quick reference
- `docs/glossary.md` — Terminology and search tips
- `docs/adr/` — Architecture Decision Records (ADRs)
- `docs/api/` — API documentation
- `docs/guides/` — How-to guides (contributing, deployment, adding services)
- `docs/features/` — Feature documentation (Service Monitoring, Multi-Instance, Real-Time Updates)
- `docs/integrations/` — External service integrations (AdGuard, Bitcoin, Tor, qBittorrent, etc.)
- `docs/security/` — Security documentation (Authentication, Rate Limiting, IP Control)
- `docs/performance/` — Performance documentation (Caching, Request Optimization)
- `docs/components/` — Frontend components and hooks
- `docs/testing/` — Testing documentation
- `docs/architecture/` — Architecture documentation (Backend, Frontend, Data Flow)
- `docs/reference/` — Code patterns, scripts, environment variables, error codes

### Knowledge Base Maintenance

**After completing any code changes, agents MUST call the `watchman-kb-updater` subagent** (`.opencode/agent/watchman-kb-updater.md`). This ensures docs stay in sync with implementation. The updater will:

1. Identify what changed based on modified files
2. Update existing docs to reflect changes
3. Create new docs for new features/endpoints/services
4. Add code links `[[path/to/file.js]]`
5. Update frontmatter dates
6. Update OpenAPI spec if API changed

**This is mandatory** — all agents should call the KB updater before finishing their run.

## Environment Variables

- Backend env file: `apps/backend/.env.local` (copy from `.env.example`)
- Frontend env file: `apps/frontend/.env.local`
- Never commit `.env.local` or any file containing secrets

### Required Backend Variables

| Variable             | Description                       |
| -------------------- | --------------------------------- |
| `AUTH_USERNAME`      | Admin username                    |
| `AUTH_PASSWORD_HASH` | bcrypt password hash              |
| `JWT_SECRET`         | JWT signing secret (min 32 chars) |
| `FRONTEND_URL`       | Frontend origin URL               |

### Service Variables

Services are configured via environment variables with the pattern `{SERVICE}_*` (e.g., `ADGUARD_MAIN_URL`, `BITCOIN_RPC_USER`). Multi-instance services use numbered prefixes (e.g., `QBITTORRENT_1_URL`, `QBITTORRENT_2_URL`).

See `docs/reference/environment-variables.md` for the complete reference.

## Security Guidelines

- **Never commit secrets** — Use `.env.local` (gitignored) for all credentials
- **Never log sensitive data** — No API keys, tokens, passwords, or PII in logs
- **Validate all inputs** — Server-side validation on backend, Zod on frontend where applicable
- **Follow least privilege** — Service configurations should use minimal required permissions
- **Rate limit public endpoints** — Protect against abuse (already implemented via middleware)
- **Audit dependencies** — Check for known vulnerabilities before adding packages
- **CSRF protection** — Maintain double-submit cookie pattern for state-changing requests

## When Stuck

If docs and code are unclear:

1. Check `docs/troubleshooting.md` for known issues
2. Search `docs/reference/error-codes.md` for error context
3. Ask the user for clarification rather than guessing

---
title: Architecture Decision Records
type: index
status: active
date: 2026-04-18
tags: [adr, architecture, index, decision, design]
description: Index of all Architecture Decision Records for the Watchman project - why design choices were made
aliases: [adr index, decisions, architecture decisions, design decisions]
---

# Architecture Decision Records

> [!abstract] Purpose
> ADRs capture significant architectural decisions, their context, and consequences. Check these before making design changes.
>
> **For AI Agents**: Always read relevant ADRs before making architectural changes.

## ADR Index

```dataview
TABLE WITHOUT ID file.link AS "Decision", date AS "Date", status AS "Status", tags AS "Tags"
FROM "docs/adr"
WHERE type = "adr"
SORT file.name ASC
```

## ADR Categories

| Category                                               | Description         |
| ------------------------------------------------------ | ------------------- | ----------------------------- |
| [[docs/adr/001-monorepo-npm-workspaces.md              | Monorepo]]          | npm workspaces structure      |
| [[docs/adr/002-service-factory-pattern.md              | Service Factory]]   | Service instantiation pattern |
| [[docs/adr/003-central-service-orchestration.md        | ServiceManager]]    | Central orchestration         |
| [[docs/adr/004-layered-security-middleware.md          | Security]]          | Security middleware layers    |
| [[docs/adr/005-real-time-websocket.md                  | WebSocket]]         | Real-time updates             |
| [[docs/adr/006-request-optimization-batching.md        | Optimization]]      | Request batching              |
| [[docs/adr/007-api-client-retry-error-handling.md      | API Client]]        | Frontend API client           |
| [[docs/adr/008-configuration-environment-variables.md  | Config]]            | Environment-based config      |
| [[docs/adr/009-frontend-technology-stack.md            | Frontend Stack]]    | React, TypeScript, Vite       |
| [[docs/adr/010-graceful-shutdown-process-management.md | Graceful Shutdown]] | Process management            |
| [[docs/adr/011-dynamic-route-generation.md             | Dynamic Routes]]    | Service route generation      |
| [[docs/adr/012-backend-framework-module-system.md      | Module System]]     | ESM module system             |
| [[docs/adr/013-backend-rewrite-typescript-fastify.md   | Backend Rewrite]]   | TypeScript + Fastify 4 + in-process state |

## Creating a New ADR

1. Copy [[docs/adr/template|ADR Template]]
2. Name it `NNN-short-title.md` (next sequential number)
3. Fill in all sections:
   - **Status**: Proposed | Accepted | Deprecated | Superseded
   - **Context**: The problem being solved
   - **Decision**: What was chosen
   - **Consequences**: Positive, negative, and risks
   - **Alternatives Considered**: What else was evaluated
4. Update this index

## When to Create an ADR

Create an ADR when making significant changes that affect:

- Project structure or architecture
- API design or endpoints
- Security model
- Technology choices
- Service patterns
- Build/deployment process

For small fixes or incremental improvements, documentation in code comments is sufficient.

## Related

- [[docs/architecture/index|Architecture Overview]]
- [[docs/guides/contributing|Contributing Guide]]
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]]

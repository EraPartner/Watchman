---
title: Tag Taxonomy
type: reference
status: active
date: 2026-04-02
tags: [tags, taxonomy, reference, organization, categorization, classification]
description: Controlled vocabulary of tags used across the Watchman knowledge base for consistent filtering and search
aliases:
  [tag guide, tagging, categories, labels, vocabulary, controlled vocabulary]
---

# Tag Taxonomy

> [!abstract] Purpose
> This document defines the controlled vocabulary of tags used across the Watchman knowledge base. Use these tags when creating or updating documentation to ensure consistent filtering via `get_tags` and `search_by_tag`.

> [!tip] AI Agent Tip
> When searching the KB, use these tags:
>
> - Search `type:adr` → find all Architecture Decision Records
> - Search `type:endpoint` → find all API endpoints
> - Search `type:integration` → find all service integrations
> - Search `ai-agent` → find AI agent-specific docs

## Tag Categories

### Content Type (use exactly one)

| Tag              | Use For                                 | Search Query          |
| ---------------- | --------------------------------------- | --------------------- |
| `index`          | Index/overview pages                    | `type:index`          |
| `endpoint`       | API endpoint documentation              | `type:endpoint`       |
| `feature`        | Feature documentation                   | `type:feature`        |
| `integration`    | External service integration docs       | `type:integration`    |
| `performance`    | Performance optimization docs           | `type:performance`    |
| `testing`        | Testing documentation                   | `type:testing`        |
| `guide`          | How-to guides                           | `type:guide`          |
| `adr`            | Architecture Decision Records           | `type:adr`            |
| `component`      | Frontend component documentation        | `type:component`      |
| `architecture`   | Architecture documentation              | `type:architecture`   |
| `security`       | Security documentation                  | `type:security`       |
| `reference`      | Reference docs (glossary, tag taxonomy) | `type:reference`      |
| `map-of-content` | Maps of Content (MOCs)                  | `type:map-of-content` |
| `template`       | Document templates                      | `type:template`       |

### Domain (use 1-3)

| Tag              | Use For                          | Example Docs                      |
| ---------------- | -------------------------------- | --------------------------------- |
| `api`            | Anything API-related             | Authentication, endpoints, errors |
| `frontend`       | Frontend React code              | Components, hooks, pages          |
| `backend`        | Backend Node.js code             | Services, middleware, routes      |
| `monitoring`     | Service monitoring functionality | Health checks, stats              |
| `authentication` | Auth, JWT, CSRF                  | Login, logout, tokens             |
| `security`       | Security-related content         | Rate limiting, IP control         |
| `websocket`      | Real-time communication          | Live updates, WebSocket           |
| `services`       | Service integrations             | AdGuard, Bitcoin, Tor             |
| `ui`             | UI components                    | Cards, badges, buttons            |
| `hooks`          | React custom hooks               | useAuth, useWebSocket             |
| `middleware`     | Express middleware               | Auth, CSRF, rate limiting         |
| `configuration`  | Env vars, config management      | Setup, environment                |

### Technology (use 0-3)

| Tag          | Use For                     | Example                    |
| ------------ | --------------------------- | -------------------------- |
| `react`      | React-specific content      | Components, hooks          |
| `typescript` | TypeScript-specific content | Frontend type definitions  |
| `express`    | Express.js-specific content | Backend routes, middleware |
| `vitest`     | Vitest testing              | Test files                 |
| `tailwind`   | Tailwind CSS styling        | Component styles           |
| `openapi`    | OpenAPI/Swagger             | API spec, Swagger UI       |
| `nodejs`     | Node.js-specific content    | Backend services           |
| `websocket`  | WebSocket-specific          | Real-time updates          |

### Status (use exactly one, from frontmatter)

| Status       | Meaning                  | When to Use                |
| ------------ | ------------------------ | -------------------------- |
| `active`     | Current and maintained   | Default for completed docs |
| `draft`      | Work in progress         | For docs being written     |
| `deprecated` | Outdated, being replaced | For superseded docs        |
| `template`   | Template for new docs    | Only for template files    |

### AI Agent Tags

| Tag          | Use For                            |
| ------------ | ---------------------------------- |
| `ai-agent`   | AI agent-specific documentation    |
| `workflow`   | Workflow and process documentation |
| `automation` | Automated tasks and scripts        |

## Tagging Rules

1. **Every doc must have**: `title`, `type`, `status`, `date`, `tags`, `description`
2. **Use singular form**: `feature` not `features`, `guide` not `guides`
3. **Be specific but not excessive**: 3-6 tags per document is ideal
4. **No orphan tags**: Every tag should appear in at least 2 documents
5. **No technology jargon as tags**: Use `react` not `react-18`, use `express` not `express-4`

## Examples

### API Endpoint Doc

```yaml
tags: [endpoint, api, authentication, backend]
```

### Integration Doc

```yaml
tags: [integration, services, backend, monitoring]
```

### Component Doc

```yaml
tags: [component, frontend, ui, react]
```

### Guide

```yaml
tags: [guide, setup, development, workflow]
```

### ADR

```yaml
tags: [adr, architecture, backend, decision]
```

### AI Agent Workflow Doc

```yaml
tags: [guide, ai-agent, workflow, automation]
```

## Quick Search Reference

| Search             | Finds                             |
| ------------------ | --------------------------------- |
| `type:adr`         | All Architecture Decision Records |
| `type:endpoint`    | All API endpoints                 |
| `type:integration` | All service integrations          |
| `type:component`   | All frontend components           |
| `type:guide`       | All how-to guides                 |
| `ai-agent`         | AI agent documentation            |
| `security`         | Security documentation            |
| `websocket`        | Real-time updates docs            |
| `multi-instance`   | Multi-instance service docs       |

## Related

- [[docs/glossary.md|Glossary]] - Key terms and disambiguation
- [[docs/INDEX.md|Knowledge Base Home]] - Main entry point
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]] - Agent-specific guide

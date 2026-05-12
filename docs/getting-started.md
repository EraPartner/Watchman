---
title: Getting Started
type: map-of-content
status: active
date: 2026-05-12
tags: [getting-started, onboarding, moc, new-developer, ai-agent, startup-flows]
description: Map of Content for new developers and AI agents to quickly navigate the Watchman knowledge base
aliases: [start here, onboarding, new dev, beginner, setup, how to start]
---

# Getting Started with Watchman

> [!abstract] Welcome
> This Map of Content (MOC) helps you quickly find what you need in the Watchman knowledge base. Follow the path that matches your goal.
>
> **For AI Agents**: Start with [[docs/guides/ai-agent-workflow|AI Agent Workflow]] for complete instructions.

## Quick Start — Three Startup Flows

Watchman can be started in three ways depending on your use case:

### Option A — macOS Desktop (Recommended for Users)

One-command desktop installation with auto-spawned backend:

```bash
./install.sh
npm run electron:prod
```

→ See [[docs/guides/running-the-desktop-app|Desktop App Guide]]

### Option B — Production Self-Host (Server Deployment)

Native backend + frontend on a server (Raspberry Pi, Linux VPS, etc.):

```bash
npm install && npm run build && npm run start
```

→ See [[docs/guides/deployment|Deployment Guide]]

### Option C — Development Mode (Contributors)

Full dev environment with hot reload:

```bash
npm install && npm run dev
```

→ See [[docs/guides/setup|Setup Guide]]

## I'm a New Developer (Option C — Development Mode)

### 1. Set Up Your Environment

Follow **Option C** above to get the full dev environment running:

```bash
npm install && npm run dev
```

This starts:
- Frontend: Vite dev server on `http://localhost:5173`
- Backend: Fastify server on `http://localhost:3001` (with nodemon auto-reload)

See [[docs/guides/setup|Setup Guide]] for full details.

### 2. Understand the Architecture

Get a high-level view before diving into code:

- [[docs/architecture/index|Architecture Overview]] - System diagrams and data flow
- [[docs/architecture/backend-architecture|Backend Architecture]] - Layered design, services, middleware
- [[docs/architecture/frontend-architecture|Frontend Architecture]] - Pages, components, hooks, WebSocket

### 3. Learn the Code Style & Development Workflow

- [[docs/guides/contributing|Contributing Guide]] - Contribution workflow and conventions
- [[docs/reference/code-patterns|Code Patterns]] - Standard patterns for all layers
- [[docs/reference/scripts|Scripts Reference]] - All npm commands grouped by purpose

### 4. Understand Key Features

- [[docs/features/service-monitoring|Service Monitoring]] - Core feature
- [[docs/features/multi-instance|Multi-Instance Support]] - Multiple service node instances
- [[docs/features/real-time-updates|Real-Time Updates]] - WebSocket real-time broadcasts

## I'm an AI Agent

### Start Here: AI Agent Workflow

> [!warning] Important
> Before making any code changes, **you must** read [[docs/guides/ai-agent-workflow|AI Agent Workflow]].

### Before Making Changes

1. Read relevant [[docs/adr/index|Architecture Decision Records]] for context
2. Check [[docs/api/index|API Documentation]] for existing endpoints
3. Search the KB using Obsidian MCP tools before reading code

### After Making Changes

1. Update relevant feature/API/integration docs
2. Add `[[code links]]` to new files
3. Update frontmatter dates

### Key Patterns

- **Wiki-links**: Use `[[path/to/file]]` format for code references
- **Frontmatter**: Always include `title`, `type`, `date`, `tags`, `description`
- **Callouts**: Use `> [!info]`, `> [!warning]`, `> [!tip]` for emphasis
- **Search first**: Use Obsidian MCP tools to search the KB before code

## I Need to Find Something

### API Endpoints

→ [[docs/api/index|API Documentation]] - All REST endpoints

### Service Integrations

→ [[docs/integrations/index|Integrations]] - AdGuard, Bitcoin, Tor, qBittorrent, and more

### Frontend Components

→ [[docs/components/index|Components Index]] - All React components and hooks

### Security

→ [[docs/security/index|Security]] - Authentication, rate limiting, IP control

### Error Codes

→ [[docs/reference/error-codes|Error Codes]] - All API error responses

### Environment Variables

→ [[docs/reference/environment-variables|Environment Variables]] - Complete reference

## I'm Making an Architectural Decision

1. Check existing [[docs/adr/index|Architecture Decisions]]
2. Use the [[docs/adr/template|ADR Template]]
3. Update relevant docs after implementation

## Knowledge Base Navigation

| Area            | Link                      | Description          |
| --------------- | ------------------------- | -------------------- | ---------------------- |
| 🏗️ Decisions    | [[docs/adr/index          | ADR Index]]          | Architecture decisions |
| 📡 APIs         | [[docs/api/index          | API Index]]          | REST endpoints         |
| 📖 Guides       | [[docs/guides/index       | Guides Index]]       | How-to guides          |
| ⚡ Features     | [[docs/features/index     | Features Index]]     | Feature docs           |
| 🔌 Integrations | [[docs/integrations/index | Integrations Index]] | External services      |
| 🧩 Components   | [[docs/components/index   | Components Index]]   | React components       |
| 📐 Architecture | [[docs/architecture/index | Architecture Index]] | System diagrams        |
| 🚀 Performance  | [[docs/performance/index  | Performance Index]]  | Optimizations          |
| 🧪 Testing      | [[docs/testing/index      | Testing Index]]      | Test strategies        |
| 🔒 Security     | [[docs/security/index     | Security Index]]     | Security docs          |

## Quick Reference

### Core Commands

**Development** (Option C):
```bash
npm run dev              # Vite + Fastify concurrently (5173, 3001)
npm run dev:frontend     # Frontend only (Vite on 5173)
npm run dev:backend      # Backend only (Fastify on 3001)
```

**Building & Production**:
```bash
npm run build            # Build prod frontend + backend
npm run dist             # Build + package Electron app
npm run electron:prod    # Launch pre-built Electron app
npm run start            # Backend + frontend preview concurrently
```

**Code Quality**:
```bash
npm run lint             # Lint frontend (ESLint)
npm run lint:backend     # Lint backend (ESLint)
npm run test             # Backend tests (Vitest)
npm run test:frontend    # Frontend tests (Vitest)
npm run test:all         # Backend + frontend concurrently
npm run test:e2e         # Playwright smoke tests
```

**Types**:
```bash
npm run generate:types   # OpenAPI → TypeScript types (apps/frontend/src/types/generated.ts)
```

### Key Directories

| Path                 | Description           |
| -------------------- | --------------------- |
| `apps/frontend/src/` | React frontend source |
| `apps/backend/`      | Node.js backend       |
| `docs/`              | This knowledge base   |
| `packages/shared/`   | Shared packages       |

### Default Ports

| Service           | Port | Notes                           |
| ----------------- | ---- | ------------------------------- |
| Frontend (Vite)   | 5173 | Dev server only (Option C)      |
| Backend (Fastify) | 3001 | Dev or production mode          |
| Desktop (Electron) | —   | Uses loopback port (randomized) |

### Important Files

| File                            | Purpose                                 |
| ------------------------------- | --------------------------------------- |
| `apps/backend/src/index.ts`     | Backend entry point                     |
| `apps/backend/openapi.yaml`     | OpenAPI specification                   |
| `apps/frontend/src/main.tsx`    | Frontend entry point                    |
| `apps/desktop/src/main.ts`      | Electron main process (desktop only)    |
| `package.json` (root)           | Root workspace config, npm scripts      |
| `install.sh`                    | macOS desktop installer (Option A)      |

## Common Tasks

See [[docs/common-tasks.md|Common Tasks]] for quick reference to:

- Starting development
- Adding a new service
- Configuring services
- Troubleshooting issues

## Troubleshooting

- [[docs/troubleshooting.md|Troubleshooting Guide]] - Common issues and solutions
- [[docs/reference/error-codes|Error Codes]] - Error code reference
- [[docs/guides/deployment|Deployment Guide]] - Production deployment

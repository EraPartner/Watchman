---
title: Scripts Reference
type: reference
status: active
date: 2026-04-10
tags: [reference, scripts, development]
description: Reference of all npm scripts and commands for the Watchman project
aliases: [scripts, npm scripts, commands, build commands]
---

# Scripts Reference

> [!abstract] Overview
> All available npm scripts for the Watchman project.

## Root Scripts

| Command                  | Description                           |
| ------------------------ | ------------------------------------- |
| `npm run dev`            | Start frontend + backend concurrently |
| `npm run dev:frontend`   | Start frontend only (Vite on 5173)    |
| `npm run dev:backend`    | Start backend only (Express on 3001)  |
| `npm run start`          | Start both + open browser             |
| `npm run start:frontend` | Start frontend in production mode     |
| `npm run start:backend`  | Start backend in production mode      |
| `npm run build`          | Build frontend + backend              |
| `npm run build:frontend` | Build frontend only                   |
| `npm run build:backend`  | Build backend only                    |
| `npm run lint`           | Lint all workspaces                   |
| `npm run lint:fix`       | Fix lint issues in all workspaces     |
| `npm run format`         | Format code with Prettier             |
| `npm run format:check`   | Check formatting                      |
| `npm run test`           | Run tests in all workspaces           |
| `npm run clean`          | Remove all node_modules               |
| `npm run setup`          | Install dependencies                  |

## Workspace Scripts

### Frontend (`apps/frontend`)

| Command                 | Description              |
| ----------------------- | ------------------------ |
| `npm run dev`           | Start Vite dev server    |
| `npm run build`         | Production build         |
| `npm run preview`       | Preview production build |
| `npm run lint`          | ESLint check             |
| `npm run lint:fix`      | Fix ESLint issues        |
| `npm run format`        | Prettier format          |
| `npm run format:check`  | Check formatting         |
| `npm run test`          | Run Vitest tests         |
| `npm run test:coverage` | Run Vitest with coverage |

### Backend (`apps/backend`)

| Command                | Description                    |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Start with nodemon/auto-reload |
| `npm run start`        | Start production server        |
| `npm run build`        | Build for production           |
| `npm run lint`         | ESLint check                   |
| `npm run lint:fix`     | Fix ESLint issues              |
| `npm run format`       | Prettier format                |
| `npm run format:check` | Check formatting               |

## Related

- [[docs/guides/setup|Setup Guide]]
- [[docs/guides/deployment|Deployment Guide]]

## PlantUML Diagrams

### Development Lifecycle

```plantuml
@startuml
!theme plain

actor "Developer" as Dev
participant "npm scripts" as NPM
participant "Frontend" as FE
participant "Backend" as BE

Dev -> NPM : npm run dev

NPM -> FE : npm run dev:frontend\n(Vite :5173)
NPM -> BE : npm run dev:backend\n(nodemon :3001)

note over FE
  Hot module reloading
  Auto-refresh on changes
end note

note over BE
  Auto-restart on changes
end note

Dev -> Dev : Write code
FE --> Dev : Hot reload
BE --> Dev : Auto-restart

Dev -> NPM : npm run lint
NPM -> NPM : ESLint check

Dev -> NPM : npm run test
NPM -> NPM : Run Vitest
@enduml
```

### Build Pipeline

```plantuml
@startuml
!theme plain

start

:Developer runs\nnpm run build;

partition "Frontend Build" {
    :Vite production build;
    :TypeScript compilation;
    :Tailwind processing;
    :Minification;
    :Output to dist/;
}

partition "Backend Build" {
    :esbuild bundle;
    :Copy openapi.yaml;
    :Copy config files;
    :Output to dist/;
}

:Production ready;

stop
@enduml
```

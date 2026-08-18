---
title: Guides
type: index
status: active
date: 2026-08-18
tags: [guide, index, setup-wizard]
description: Index of all how-to guides for the Watchman project
aliases: [guides index, how-to, tutorials]
---

# Guides

> [!abstract] Overview
> Step-by-step guides for common Watchman development and deployment tasks.

## Guide Index

```dataview
TABLE WITHOUT ID file.link AS "Guide", date AS "Date", status AS "Status"
FROM "docs/guides"
WHERE type = "guide"
SORT file.name ASC
```

## Available Guides

| Guide                           | Description         |
| ------------------------------- | ------------------- | ------------------------------------ |
| [[docs/guides/setup             | Setup Guide]]           | Local development environment setup  |
| [[docs/guides/deployment        | Deployment Guide]]      | Production deployment instructions   |
| [[docs/guides/running-the-desktop-app | Desktop App]]   | Build and run the Electron desktop application |
| [[docs/guides/adding-services   | Adding Services]]       | How to add a new service integration |
| [[docs/guides/contributing      | Contributing]]          | Contribution guidelines and workflow |
| [[docs/guides/ai-agent-workflow | AI Agent Workflow]]     | Comprehensive AI agent instructions  |
| [[docs/guides/monitoring-upgrade-plan | Monitoring Upgrade Plan]] | Phase-by-phase rollout of ADR-019 (two-tier health + per-service methodology) |
| [[docs/guides/devcontainer | Devcontainer Guide]] | Hardened apple/container sandbox for Claude Code or OpenAI Codex |

> [!note] Superseded guides
> `running-the-setup-wizard` and `deploying-to-raspberry-pi` were removed as part of [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]] (revert split deploy). The setup wizard Connect step and Pi deployment are no longer part of the architecture.

## AI Agent Resources

AI agents working on Watchman should read:

1. **Start here**: [[docs/guides/ai-agent-workflow|AI Agent Workflow]] - Complete workflow guide
2. **Code patterns**: [[docs/reference/code-patterns|Code Patterns]] - Standard patterns
3. **Testing**: [[docs/testing/index|Testing Index]] - Test requirements

## Related

- [[docs/getting-started.md|Getting Started]]
- [[docs/reference/scripts|Scripts Reference]]

## PlantUML Diagrams

### Development Workflow

```plantuml
@startuml
!theme plain

actor "Developer" as Dev
participant "Setup" as Setup
participant "Development" as DevEnv
participant "Testing" as Test
participant "Documentation" as Docs
participant "Deployment" as Deploy

Dev -> Setup : npm install
Dev -> Setup : Configure .env

Dev -> DevEnv : npm run dev
DevEnv --> Dev : Backend :3001\nFrontend :5173

Dev -> Test : npm run test
Test --> Dev : Test results

Dev -> Docs : Update relevant docs
Docs --> Dev : Doc updated

Dev -> Deploy : npm run build
Deploy --> Dev : Production build

note right of DevEnv
  Hot module reloading
  for rapid iteration
end note
@enduml
```

### Guide Selection

```plantuml
@startuml
!theme plain

start

:Need to...?;

if (Set up project?) then (yes)
    :[[docs/guides/setup|Setup Guide]];
elseif (Deploy to production?) then (yes)
    :[[docs/guides/deployment|Deployment Guide]];
elseif (Add new service?) then (yes)
    :[[docs/guides/adding-services|Adding Services Guide]];
elseif (Contribute code?) then (yes)
    :[[docs/guides/contributing|Contributing Guide]];
elseif (AI agent task?) then (yes)
    :[[docs/guides/ai-agent-workflow|AI Agent Workflow]];
endif

stop
@enduml
```

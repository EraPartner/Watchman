---
title: Contributing Guide
type: guide
status: active
date: 2026-04-02
tags: [guide, contributing, development, workflow]
description: Contribution guidelines and workflow for the Watchman project
aliases: [contributing, contribution, workflow, pr guidelines]
---

# Contributing Guide

> [!abstract] Overview
> This guide covers the contribution workflow and coding standards for Watchman.

## Getting Started

1. Fork the repository
2. Create a feature/fix branch from `main`
3. Make changes with tests/docs where applicable
4. Run lint/build/test locally
5. Open a pull request with clear context

## Branch Naming

- Features: `feature/description`
- Fixes: `fix/description`
- Docs: `docs/description`
- Refactoring: `refactor/description`

## Code Standards

### General

- Use TypeScript for frontend code
- Use ES modules in backend (`import`/`export`)
- Follow existing code style and conventions
- No secrets or credentials in code

### Formatting

- Use Prettier for code formatting
- Run `npm run format` before committing
- Check formatting with `npm run format:check`

### Linting

- ESLint configured per workspace
- Run `npm run lint` before committing
- Fix issues with `npm run lint:fix`

## Commit Messages

Use descriptive commit messages:

- `feat: add AdGuard protection toggle`
- `fix: resolve WebSocket reconnection issue`
- `docs: update API documentation`
- `refactor: simplify ServiceManager initialization`

## Pull Requests

- Use descriptive PR titles
- Keep PRs focused and small when possible
- Add screenshots/GIFs for UI changes
- Document any new configuration flags or environment variables
- Link related issues

## Testing

- Write tests for new functionality
- Run `npm run test` before submitting PR
- Tests located in `tests/` directory

## Documentation

- Update relevant docs for code changes
- Document new environment variables
- Update OpenAPI spec for API changes
- Follow KB conventions (frontmatter, wiki-links, tags)

## Code Review

- Reviewers check for correctness, style, and security
- Address review feedback promptly
- Squash and merge after approval

## Related

- [[docs/guides/setup|Setup Guide]]
- [[docs/reference/code-patterns|Code Patterns]]
- [[docs/tag-taxonomy.md|Tag Taxonomy]]

## PlantUML Diagrams

### Contribution Workflow

```plantuml
@startuml
!theme plain

actor "Contributor" as Dev
participant "Git" as Git
participant "Local Tests" as Test
participant "Pull Request" as PR
participant "Reviewer" as Review

Dev -> Git : Create feature branch
Dev -> Dev : Make changes
Dev -> Test : npm run lint && npm run test
Test --> Dev : All checks pass

Dev -> Git : Commit changes
Dev -> PR : Open Pull Request

PR -> Review : Code review
Review -> Review : Check correctness, style, security

alt Changes Requested
    Review --> Dev : Request changes
    Dev -> Dev : Address feedback
    Dev -> PR : Push updates
    PR -> Review : Re-review
else Approved
    Review --> PR : Approve
    PR -> Git : Squash and merge
end
@enduml
```

### Pull Request Checklist

```plantuml
@startuml
!theme plain

start

:Open Pull Request;

if (Descriptive title?) then (no)
    :Update title;
endif

if (Tests passing?) then (no)
    :Fix failing tests;
endif

if (Lint clean?) then (no)
    :Run npm run lint:fix;
endif

if (Docs updated?) then (no)
    :Update relevant docs;
endif

if (OpenAPI spec updated?) then (no)
    :Update openapi.yaml;
endif

if (New env vars documented?) then (no)
    :Add to environment-variables.md;
endif

:Ready for review;

stop
@enduml
```

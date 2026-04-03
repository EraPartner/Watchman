---
title: Reference
type: index
status: active
date: 2026-04-02
tags: [reference, index]
description: Index of all reference documentation for the Watchman project - environment variables, scripts, code patterns, and error codes
aliases: [reference index, refs, quick reference]
---

# Reference

> [!abstract] Overview
> Quick-reference documentation for developers working with the Watchman codebase. These docs provide at-a-glance information for configuration, commands, patterns, and error handling.

## Reference Index

```dataview
TABLE WITHOUT ID file.link AS "Reference", date AS "Updated", tags AS "Tags"
FROM "docs/reference"
WHERE type = "reference"
SORT file.name ASC
```

## Configuration

| Document                               | Description             |
| -------------------------------------- | ----------------------- | --------------------------------------------- |
| [[docs/reference/environment-variables | Environment Variables]] | Complete reference of all env vars by service |
| [[docs/reference/scripts               | Scripts Reference]]     | All npm scripts and commands                  |

## Development

| Document                           | Description         |
| ---------------------------------- | ------------------- | --------------------------------------------------- |
| [[docs/reference/code-patterns     | Code Patterns]]     | Standard patterns for backend and frontend          |
| [[docs/reference/error-codes       | Error Codes]]       | HTTP status codes and error response formats        |
| [[docs/reference/openapi-spec      | OpenAPI Spec]]      | How to read and extend the OpenAPI spec             |
| [[docs/reference/backend-utilities | Backend Utilities]] | Utility modules (circuit breaker, validation, etc.) |

## Quick Links

- **Backend Entry**: [[apps/backend/server.js]]
- **Frontend Entry**: [[apps/frontend/src/main.tsx]]
- **OpenAPI Spec**: [[apps/backend/openapi.yaml]]
- **Service Factory**: [[apps/backend/services/serviceFactoryConfig.js]]
- **Route Generation**: [[apps/backend/routes/serviceFactory.js]]
- **Logger**: [[docs/LOGGING|Logging]]

## Related

- [[docs/guides/setup|Setup Guide]]
- [[docs/guides/adding-services|Adding Services Guide]]
- [[docs/glossary.md|Glossary]]
- [[docs/common-tasks.md|Common Tasks]]

## PlantUML Diagrams

### Reference Documentation Map

```plantuml
@startuml
!theme plain

package "Reference" as Ref {
    [Environment Variables] as Env
    [Scripts] as Scripts
    [Code Patterns] as Patterns
    [Error Codes] as Errors
    [OpenAPI Spec] as OpenAPI
}

package "Related Docs" as Related {
    [Setup Guide] as Setup
    [Adding Services] as AddSvc
    [Glossary] as Glossary
    [Common Tasks] as Tasks
}

Ref --> Related

note right of Env
  All env vars by service
  Required vs optional
end note

note right of Patterns
  Backend & frontend
  Standard conventions
end note

note right of Errors
  HTTP status codes
  Response formats
end note
@enduml
```

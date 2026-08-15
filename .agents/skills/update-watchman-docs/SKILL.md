---
name: update-watchman-docs
description: Synchronize the Watchman Obsidian knowledge base, OpenAPI specification, inline PlantUML diagrams, and interactive flow visualizer with implementation changes. Use after behavior, API, architecture, service integration, configuration, security, workflow, package, route, service, middleware, page, hook, store, WebSocket, or other project knowledge changes that affect docs/.
---

# Update Watchman documentation

Inspect the implementation diff first. Update only documentation made stale by the change, but
follow every connected surface through OpenAPI, indexes, diagrams, backlinks, and the visualizer.

## Documentation routing and graph integrity

- Service: update its `docs/integrations/` page.
- Endpoint or schema: update `apps/backend/openapi.yaml` and matching API docs.
- New endpoint: update `docs/api/index.md`.
- New middleware: update `docs/architecture/backend-architecture.md`.
- New component or hook: update `docs/components/index.md`.
- New environment variable: update `docs/reference/environment-variables.md`.
- Behavior: update the relevant feature, guide, architecture, security, performance, testing, or
  troubleshooting page.
- Architectural decision: add the next numbered ADR from `docs/adr/template.md`; never rewrite an
  accepted ADR.

Use `obsidian:obsidian-markdown`. Preserve required frontmatter, wikilinks, embeds, callouts,
aliases, and cross-references. Update dates. Prefer existing Dataview patterns over static lists.
Each new or heavily changed note must link to a section index and related documentation. Add
reciprocal links where useful and avoid orphan notes.

## Inline PlantUML diagrams

Diagrams are fenced `plantuml` blocks inside `docs/architecture/*.md`. Update diagram and prose
together.

| Change                                        | Architecture document                      |
| --------------------------------------------- | ------------------------------------------ |
| Backend service, middleware, route, or schema | `backend-architecture.md`                  |
| React page, hook, store, or context           | `frontend-architecture.md`                 |
| End-to-end or WebSocket flow                  | `data-flow.md`                             |
| Auth, rate limit, real-time, or IP control    | `core-systems.md`                          |
| Cross-cutting capability                      | Matching diagram in `index.md`             |
| Integration                                   | Data-flow diagram and its integration page |

Update `docs/architecture/index.md` when adding a diagram.

## Interactive flow visualizer

`docs/flow-visualizer.html` contains JSON in `<script type="application/json" id="flow-data">`.
Maintain it for changed packages, services, integrations, middleware, WebSocket channels, build
surfaces, dependencies, and workflows.

- Components need `id`, `label`, `kind`, coordinates, and accurate optional path and description.
- Load-bearing dependencies belong in `baseEdges[]`.
- Flows need `id`, `name`, `category`, `summary`, and ordered steps.
- Every step needs existing component IDs and non-empty `payload` and `annotation`; cite real code
  paths in annotations.

Before finishing, extract and parse the JSON. Verify IDs, canvas bounds, overlaps, payloads, and
annotations. Keep counts and category callouts accurate in `docs/INDEX.md`,
`docs/architecture/index.md`, and other visualizer references.

## Completion report

Report docs and OpenAPI changes, diagram changes or why none were needed, flow-visualizer changes or
why none were needed, index/backlink/Dataview checks, validation, and remaining gaps. Confirm claims
against code and tests; never document intended behavior as implemented.

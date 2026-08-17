---
title: "Session: Documentation Update Lifecycle"
type: review
status: complete
date: 2026-08-17
tags: [session, review, documentation, workflow, ai-agent, validation]
description: Clarification of when Watchman agents must synchronize documentation and run final validation
aliases: [documentation lifecycle session, docs update timing review]
---

# Session: Documentation Update Lifecycle

> [!abstract] Summary
> Made the documentation lifecycle explicit across shared agent guidance, the documentation skill,
> the AI agent workflow, docs-specific rules, and the pre-commit review checklist.

## Lifecycle

1. Read relevant project knowledge before implementation.
2. Keep coupled API contracts and generated types synchronized during implementation.
3. Run the `update-watchman-docs` skill after the implementation diff stabilizes and before final
   validation whenever project knowledge may become stale.
4. Run final tests and documentation checks after docs and generated artifacts are synchronized.
5. Repeat the documentation check when validation changes implementation behavior or contracts.

The trigger is documentation impact rather than diff size. Session notes are required only for
cross-module or otherwise substantial changes, not isolated mechanical edits.

## Documentation Impact

No application behavior, API contract, architecture component, or runtime flow changed. OpenAPI,
inline PlantUML diagrams, and `docs/flow-visualizer.html` therefore required no update.

## Related

- [[docs/INDEX|Knowledge Base Home]]
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]]
- [[docs/reviews/2026-08-15-agent-configuration-migration|Agent Configuration Migration]]

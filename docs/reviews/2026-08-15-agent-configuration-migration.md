---
title: "Session: Model-Neutral Agent Configuration Migration"
type: review
status: complete
date: 2026-08-15
tags: [session, review, ai-agent, workflow, configuration, skills]
description: Review and consolidation of Watchman agent guidance and project skills across Codex and Claude Code
aliases: [agent configuration migration, model-neutral agent config review]
---

# Session: Model-Neutral Agent Configuration Migration

> [!abstract] Summary
> Reviewed the repository agent configuration, removed active contradictory guidance, and made
> `AGENTS.md` plus `.agents/skills/` the canonical shared sources. Claude Code remains supported
> through imports and compatibility entries instead of separate active workflows.

## Findings Resolved

1. The Claude-specific `add-service` skill had drifted from current registration and security
   behavior. Its compatibility entry now defers to the canonical shared skill.
2. `CLAUDE.md` duplicated project rules and referenced a Claude-only documentation subagent.
   It now imports `AGENTS.md`, while documentation work uses the shared `update-watchman-docs` skill.
3. `REVIEW.md` and the AI agent workflow guide still named Claude-only sources and obsolete tools.
   They now describe the shared configuration layout and current verification rules.

## Boundaries

The hardened devcontainer remains Claude-specific. Codex container authentication and
configuration synchronization are separate host concerns and were not added to this repository.
Historical ADRs were not rewritten.

## Documentation Impact

No application behavior, API, architecture diagram, or interactive flow changed. The OpenAPI spec,
inline PlantUML diagrams, and `docs/flow-visualizer.html` therefore required no update.

## Related

- [[docs/guides/ai-agent-workflow|AI Agent Workflow]]
- [[docs/guides/devcontainer|Devcontainer Guide]]
- [[docs/guides/contributing|Contributing Guide]]

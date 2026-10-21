---
title: Built-in Agent Sandboxes
type: adr
status: accepted
date: 2026-10-04
tags: [adr, development, security, tooling]
description: Retire the repository agent container and use built-in Claude and Codex sandboxes
aliases: [adr-031, agent sandbox retirement]
---

# ADR-031: Built-in Agent Sandboxes

## Status

- **Status**: Accepted
- **Date**: 2026-10-04
- **Supersedes**: [[docs/adr/030-devcontainer-apple-container-runtime|ADR-030]]

## Context

The shared agent container workflow is retired. Development uses the built-in sandboxes
provided by Claude and Codex, with access controlled by the current host policy.

## Decision

Remove `.devcontainer/`, its provider launchers and policy bundle, and the CI fleet drift
check. Keep application CI checks and native development commands. Preserve earlier ADRs
as historical evidence; their container setup instructions no longer describe current use.

## Consequences

There is no repository agent image, credential staging, proxy configuration, or bundle
synchronization to maintain. Permissions now depend on the active client and host policy;
this decision does not establish that those policies enforce every former container control.
Existing runtime images, volumes, and credentials are outside this repository cleanup.

## References

- [[docs/adr/index|Architecture Decision Records]]
- [[docs/architecture/index|Architecture Overview]]
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]]
- [[docs/guides/devcontainer|Agent Sandbox Guide]]
- Current workflow: `.github/workflows/ci.yml`

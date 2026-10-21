---
title: Agent Sandbox Guide
type: guide
status: active
date: 2026-10-04
tags: [guide, claude, codex, security, tooling, setup]
description: Current agent sandbox workflow after retiring the repository agent container
aliases: [devcontainer guide, agent sandbox guide]
---

# Agent Sandbox Guide

Claude and Codex now use their built-in sandboxes and the current host access policy.
The repository no longer ships an agent container, provider launchers, credential staging,
proxy allowlists, or container policy adapters. Start development with the native commands
in [[docs/guides/setup|Setup Guide]] and follow `AGENTS.md`.

Access to project files, network operations, and publication depends on the active client
policy. Check the current session before relying on any permission. Repository cleanup does
not change those permissions or remove existing runtime images, volumes, or credentials.

See [[docs/guides/ai-agent-workflow|AI Agent Workflow]], [[docs/guides/index|Guides]], and
[[docs/adr/031-built-in-agent-sandboxes|ADR-031]]. ADR-024 and ADR-030 remain historical records
of the retired container workflow.

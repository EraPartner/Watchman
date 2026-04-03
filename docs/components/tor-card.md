---
title: "Component: TorCard"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, service-card, tor, privacy]
description: Tor relay monitoring card displaying relay statistics, bandwidth, and network info
aliases: [tor card, tor relay card, onion routing monitoring]
---

# Component: TorCard

> [!abstract] Overview
> Displays Tor relay status including relay nickname, bandwidth statistics, flags, and network position.

## Purpose

Monitors Tor relay nodes showing relay information fetched from the Onionoo API, including bandwidth, flags (Guard, Exit, etc.), uptime, and network consensus position.

## Props

| Prop             | Type           | Required | Default     | Description                           |
| ---------------- | -------------- | -------- | ----------- | ------------------------------------- |
| `name`           | `string`       | Yes      | —           | Service display name                  |
| `status`         | `ServerStatus` | Yes      | —           | Current online/offline/warning status |
| `instanceId`     | `string`       | No       | `undefined` | Multi-instance identifier             |
| `instanceNumber` | `number`       | No       | `undefined` | Instance number for display suffix    |

## Displayed Metrics

| Metric           | Description                             |
| ---------------- | --------------------------------------- |
| Relay Nickname   | Tor relay identifier                    |
| Bandwidth        | Read/write bandwidth rates              |
| Flags            | Relay flags (Guard, Exit, Stable, etc.) |
| Uptime           | Relay uptime                            |
| Platform         | Tor version and platform                |
| Contact          | Contact information                     |
| Network Position | Consensus position                      |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/components/UpdateBadge.tsx]]` — Update availability
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`

## Source

- [[apps/frontend/src/components/TorCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/tor|Tor Integration]]
- [[docs/features/multi-instance|Multi-Instance Support]]

---
title: "Component: RoonCard"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, service-card, roon, music]
description: Roon music server monitoring card with connectivity and port status
aliases: [roon card, music server card, roon monitoring]
---

# Component: RoonCard

> [!abstract] Overview
> Displays Roon music server connectivity status using ICMP ping and TCP port checks.

## Purpose

Monitors Roon music server availability through lightweight network checks. Shows whether the server is reachable and which service ports are responding.

## Props

| Prop             | Type           | Required | Default     | Description                           |
| ---------------- | -------------- | -------- | ----------- | ------------------------------------- |
| `name`           | `string`       | Yes      | —           | Service display name                  |
| `status`         | `ServerStatus` | Yes      | —           | Current online/offline/warning status |
| `instanceId`     | `string`       | No       | `undefined` | Multi-instance identifier             |
| `instanceNumber` | `number`       | No       | `undefined` | Instance number for display suffix    |

## Data Fetching

Uses React Query with `useQuery` for status polling.

## Displayed Metrics

| Metric            | Description                    |
| ----------------- | ------------------------------ |
| Host Reachability | ICMP ping result               |
| Port Status       | TCP port check results         |
| Response Time     | Ping latency                   |
| Last Check        | Timestamp of last health check |

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`
- `[[apps/frontend/src/services/ApiClient|apiClient]]`

## Source

- [[apps/frontend/src/components/RoonCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/roon|Roon Integration]]

---
title: "Component: IpfsCard"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, service-card, ipfs, kubo, p2p]
description: IPFS/Kubo node monitoring card showing peer count, repo stats, and bandwidth usage
aliases: [ipfs card, kubo card, distributed storage monitoring]
---

# Component: IpfsCard

> [!abstract] Overview
> Displays IPFS (Kubo) node status including peer connections, repository statistics, bandwidth usage, and Bitswap activity.

## Purpose

Monitors IPFS nodes showing network participation, storage usage, data transfer rates, and content sharing activity through the Bitswap protocol.

## Props

| Prop             | Type     | Required | Default     | Description                        |
| ---------------- | -------- | -------- | ----------- | ---------------------------------- |
| `instanceId`     | `string` | No       | `"ipfs"`    | Service instance identifier        |
| `instanceNumber` | `number` | No       | `undefined` | Instance number for display suffix |

## Data Fetching

Uses manual `useEffect` + `setInterval` pattern (not React Query).

## Displayed Metrics

| Metric                       | Description                     |
| ---------------------------- | ------------------------------- |
| Node ID                      | IPFS peer identifier            |
| Peer Count                   | Number of connected peers       |
| Repo Size                    | Storage used by IPFS repository |
| Repo Max                     | Maximum configured repo size    |
| Bandwidth In/Out             | Current data transfer rates     |
| Bitswap Blocks Sent/Received | Content sharing activity        |
| IPFS Version                 | Kubo version                    |

## Known Issues

> [!warning] Technical Debt
>
> - Uses manual `useEffect` + `setInterval` instead of React Query
> - Casts API responses to `any`

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/components/UpdateBadge.tsx]]` — Update availability
- `[[apps/frontend/src/hooks/useEnabledServices|useEnabledServices]]`

## Source

- [[apps/frontend/src/components/IpfsCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/ipfs|IPFS Integration]]

---
title: "Component: AdGuardCard"
type: component
status: active
date: 2026-04-02
tags: [component, frontend, react, service-card, adguard, dns]
description: AdGuard Home DNS filter monitoring card with query stats, blocking rate, and protection controls
aliases: [adguard card, dns filter card, adguard home monitoring]
---

# Component: AdGuardCard

> [!abstract] Overview
> Displays AdGuard Home DNS filtering status, query statistics, blocking rate, and protection feature metrics in a card layout.

## Purpose

Monitors AdGuard Home instances showing DNS query counts, blocked domains, blocking rate percentage, protection features (malware, SafeSearch, parental controls), and performance metrics.

## Props

| Prop             | Type                 | Required | Default     | Description                           |
| ---------------- | -------------------- | -------- | ----------- | ------------------------------------- |
| `name`           | `string`             | Yes      | —           | Service display name                  |
| `status`         | `ServerStatus`       | Yes      | —           | Current online/offline/warning status |
| `stats`          | `AdGuardServerStats` | Yes      | —           | Detailed AdGuard statistics           |
| `instanceId`     | `string`             | No       | `undefined` | Multi-instance identifier             |
| `instanceNumber` | `number`             | No       | `undefined` | Instance number for display suffix    |

## Displayed Metrics

| Metric              | Source                      | Description                                  |
| ------------------- | --------------------------- | -------------------------------------------- |
| Version             | `stats.version`             | AdGuard Home version string                  |
| Total Queries (24h) | `stats.totalQueries`        | Total DNS queries in last 24 hours           |
| Allowed             | `stats.allowedQueries`      | Queries that passed through                  |
| Blocked             | `stats.blockedQueries`      | Queries blocked by filters                   |
| Blocking Rate       | `stats.blockingRate`        | Percentage of queries blocked (progress bar) |
| Malware Blocked     | `stats.safebrowsingBlocked` | SafeBrowsing/malware blocks                  |
| SafeSearch Blocked  | `stats.safesearchBlocked`   | SafeSearch enforced blocks                   |
| Parental Blocked    | `stats.parentalBlocked`     | Parental control blocks                      |
| Avg Response Time   | `stats.avgProcessingTime`   | DNS query processing time                    |
| Top Blocked Domain  | `stats.topBlockedDomain`    | Most frequently blocked domain               |
| Top Queried Domain  | `stats.topQueriedDomain`    | Most frequently queried domain               |
| Top Client          | `stats.topClient`           | Most active DNS client                       |

## Behavior

- Uses `[[docs/components/use-config-hook|useConfig]]` for AdGuard web URL
- Shows `AlertTriangle` warning icon when protection is disabled
- Shows `UpdateBadge` for version update availability
- Appends `#N` suffix when `instanceNumber` is provided
- Web URL link opens AdGuard Home admin interface in new tab

## Dependencies

- `[[apps/frontend/src/components/ui/card.tsx]]` — Card layout
- `[[apps/frontend/src/components/ui/progress.tsx]]` — Blocking rate progress bar
- `[[apps/frontend/src/components/ServerStatusBadge.tsx]]` — Status indicator
- `[[apps/frontend/src/components/UpdateBadge.tsx]]` — Update availability
- `[[docs/components/use-config-hook|useConfig]]` — Web URL configuration
- `lucide-react` — Icons

## Source

- [[apps/frontend/src/components/AdGuardCard.tsx]]

## Related

- [[docs/components/index|Components Index]]
- [[docs/integrations/adguard|AdGuard Integration]]
- [[docs/api/adguard|AdGuard API]]

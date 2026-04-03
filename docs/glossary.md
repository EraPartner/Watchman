---
title: Glossary & Terminology
type: reference
status: active
date: 2026-04-02
tags: [glossary, terminology, reference, search, aliases, disambiguation]
description: Key terms, aliases, and disambiguation for the Watchman project - helps with search and navigation
aliases:
  [
    glossary,
    terms,
    terminology,
    dictionary,
    vocabulary,
    disambiguation,
    definitions,
    what is,
    meaning,
  ]
---

# Glossary & Terminology

> [!abstract] Purpose
> This glossary helps both **humans** and **AI agents** find the right documentation when searching for concepts. Many terms in Watchman have multiple names across code, docs, and UI. Use this for quick concept lookup and to understand terminology.

## How to Use This Glossary

1. **Search by concept**: Look up terms you're unfamiliar with
2. **Find aliases**: See alternative names for common terms
3. **Navigate to docs**: Click links to detailed documentation
4. **AI agent search**: Use aliases as search keywords

> [!tip] AI Agent Tip
> When searching the KB, use these common aliases:
>
> - "auth" → Authentication, JWT, login
> - "multi-instance" → Multi-instance services, multiple nodes
> - "websocket" → Real-time updates, WebSocket
> - "service" → Service integration, monitor

## Core Concepts

| Term                 | Also Known As                                     | Description                                                                                           | See Also                                    |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------- |
| **Service**          | integration, monitor, addon, plugin               | An external self-hosted service that Watchman monitors (e.g., AdGuard Home, Bitcoin node, Tor relay). | [[docs/features/service-monitoring          | Service Monitoring]] |
| **Service Instance** | node, instance, server, deployment                | A specific deployment of a service type. Multiple instances of the same type are supported.           | [[docs/features/multi-instance              | Multi-Instance]]     |
| **Health Check**     | status check, ping, heartbeat                     | A lightweight request to verify a service is responsive. Returns online/offline status.               | [[docs/api/index                            | API]]                |
| **Stats**            | metrics, statistics, data, information            | Detailed service-specific data (e.g., AdGuard query counts, Bitcoin block height).                    | [[docs/api/index                            | API]]                |
| **ServiceManager**   | orchestrator, service manager, service controller | Central backend class that manages all service instances and routes requests.                         | [[apps/backend/services/ServiceManager.js]] |
| **Circuit Breaker**  | failure protection, fault tolerance, breaker      | Pattern that prevents repeated calls to failing services.                                             | [[docs/performance/index                    | Performance]]        |

## Services

| Service          | Also Known As                      | Description                                       | See Also                         |
| ---------------- | ---------------------------------- | ------------------------------------------------- | -------------------------------- | -------------------------- |
| **AdGuard Home** | AdGuard, AdGuardDNS                | DNS-level ad blocker and tracker blocker          | [[docs/integrations/adguard      | AdGuard Integration]]      |
| **Bitcoin**      | BTC, Bitcoin Core, BTC node        | Bitcoin full node with RPC interface              | [[docs/integrations/bitcoin      | Bitcoin Integration]]      |
| **Tor**          | Tor Network, Onion Router          | Tor relay/proxy for anonymous communication       | [[docs/integrations/tor          | Tor Integration]]          |
| **qBittorrent**  | qBit, qBittorrent WebUI            | BitTorrent client with web interface              | [[docs/integrations/qbittorrent  | qBittorrent Integration]]  |
| **IPFS**         | InterPlanetary File System         | Decentralized file storage and content addressing | [[docs/integrations/ipfs         | IPFS Integration]]         |
| **Synology**     | Synology NAS, DiskStation          | Synology Network Attached Storage                 | [[docs/integrations/synology     | Synology Integration]]     |
| **Roon**         | Roon Server, Roon Core             | Music server and streaming platform               | [[docs/integrations/roon         | Roon Integration]]         |
| **Philips Hue**  | Hue Bridge, Philips Smart Lighting | Smart lighting system bridge                      | [[docs/integrations/philips-hue  | Philips Hue Integration]]  |
| **Homebridge**   | HomeKit Bridge                     | HomeKit to third-party smart home integration     | [[docs/integrations/homebridge   | Homebridge Integration]]   |
| **Alby Hub**     | Alby, Alby Lightning               | Lightning Network wallet and node                 | [[docs/integrations/albyhub      | Alby Hub Integration]]     |
| **Mac Mini**     | Mac Mini Server, macOS Server      | macOS-based server or device                      | [[docs/integrations/macmini      | Mac Mini Integration]]     |
| **Raspberry Pi** | RPi, RasPi                         | Raspberry Pi single-board computer                | [[docs/integrations/raspberry-pi | Raspberry Pi Integration]] |
| **Router**       | Network Router, Beryl, Telenet     | Network router monitoring (Beryl/Telenet)         | [[docs/integrations/router       | Router Integration]]       |
| **Nostrcheck**   | Nostr Relay Checker                | Nostr relay availability checker                  | [[docs/integrations/nostrcheck   | Nostrcheck Integration]]   |

## Technical Terms

| Term                | Also Known As                              | Description                                                          | See Also                                 |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------- | ---------------------- |
| **WebSocket**       | WS, Socket, real-time, live                | Real-time bidirectional communication for status updates             | [[docs/features/real-time-updates        | Real-Time Updates]]    |
| **JWT**             | JSON Web Token, bearer token, access token | JSON Web Token for authentication                                    | [[docs/security/authentication           | Authentication]]       |
| **CSRF**            | Cross-Site Request Forgery, XSRF           | Cross-Site Request Forgery protection (double-submit cookie pattern) | [[docs/security/authentication           | Authentication]]       |
| **Rate Limiting**   | rate limit, throttling, rate cap           | Tiered request throttling per IP                                     | [[docs/security/rate-limiting            | Rate Limiting]]        |
| **IP Control**      | IP whitelist, IP blacklist, IP filtering   | Whitelist/blacklist for IP-based access                              | [[docs/security/ip-control               | IP Control]]           |
| **OpenAPI**         | Swagger, API specification, OpenAPI spec   | API specification format (Swagger)                                   | [[docs/api/index                         | API Documentation]]    |
| **Factory Pattern** | factory, service factory                   | Service instantiation pattern via `serviceFactoryConfig.js`          | [[docs/architecture/backend-architecture | Backend Architecture]] |
| **ARP Lookup**      | ARP, neighbor discovery, network scan      | Network neighbor discovery for router services                       | [[docs/integrations/router               | Router Integration]]   |

## UI Terms

| Term                      | Also Known As                     | Description                                         | See Also                |
| ------------------------- | --------------------------------- | --------------------------------------------------- | ----------------------- | ------------ |
| **Service Card**          | card, service widget, status card | React component displaying service status and stats | [[docs/components/index | Components]] |
| **OptimizedServiceCard**  | optimized card, base card         | Base card with request optimization                 | [[docs/components/index | Components]] |
| **PerformantServiceCard** | performant card                   | Base card with performance optimizations            | [[docs/components/index | Components]] |
| **UpdateBadge**           | update badge, version badge       | Badge showing available updates for a service       | [[docs/components/index | Components]] |
| **ServerStatusBadge**     | server badge, status badge        | Badge showing overall server status                 | [[docs/components/index | Components]] |

## Search Tips

### Common Search Patterns

| Search Query                             | Finds                             |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------- | ---------------- |
| `adguard`                                | [[docs/integrations/adguard       | AdGuard Integration]], [[docs/api/index           | API]]            |
| `auth`, `login`, `jwt`, `token`          | [[docs/security/authentication    | Authentication]], [[docs/api/index                | Auth Endpoints]] |
| `multi-instance`, `multiple`, `instance` | [[docs/features/multi-instance    | Multi-Instance]], [[docs/integrations/qbittorrent | qBittorrent]]    |
| `websocket`, `real-time`, `live`         | [[docs/features/real-time-updates | Real-Time Updates]]                               |
| `rate limit`, `throttle`                 | [[docs/security/rate-limiting     | Rate Limiting]]                                   |
| `circuit breaker`, `failure`             | [[docs/performance/index          | Performance]]                                     |
| `add service`, `new service`             | [[docs/guides/adding-services     | Adding Services Guide]]                           |

### Quick Reference by Category

**For Developers:**

- Adding features → [[docs/guides/contributing|Contributing Guide]]
- Code patterns → [[docs/reference/code-patterns|Code Patterns]]
- Testing → [[docs/testing/index|Testing Index]]

**For AI Agents:**

- Workflow → [[docs/guides/ai-agent-workflow|AI Agent Workflow]]
- ADRs → [[docs/adr/index|Architecture Decision Records]]
- Common tasks → [[docs/common-tasks.md|Common Tasks]]

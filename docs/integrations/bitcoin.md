---
title: Bitcoin Integration
type: integration
status: active
date: 2026-04-02
tags: [integration, services, backend, monitoring]
description: Bitcoin full node integration for Watchman
aliases: [bitcoin, btc, bitcoin node, rpc]
---

# Bitcoin Integration

> [!abstract] Overview
> Monitors a Bitcoin full node via RPC, optionally through Tor for privacy.

## Configuration

```bash
BITCOIN_ONION_URL=your-onion-address.onion
BITCOIN_RPC_USER=your-bitcoin-rpc-user
BITCOIN_RPC_PASSWORD=your-bitcoin-rpc-password
BITCOIN_RPC_PORT=8332
BITCOIN_TOR_PROXY=socks5h://127.0.0.1:9050  # default
```

## Endpoints

| Endpoint                   | Description                | Auth              |
| -------------------------- | -------------------------- | ----------------- |
| `GET /api/bitcoin/status`  | Health check               | No (rate limited) |
| `GET /api/bitcoin/stats`   | Block height, network info | Yes               |
| `GET /api/bitcoin/health`  | Health alias               | No (rate limited) |
| `GET /api/bitcoin/updates` | Check for updates          | Yes               |

## Service Class

[[apps/backend/services/BitcoinService.js|BitcoinService.js]]

### Methods

- `checkHealth()` - RPC connection test
- `getStats()` - Block height, difficulty, network info
- `checkForUpdates()` - Check for Bitcoin Core updates

## Frontend Component

[[apps/frontend/src/components/BitcoinCard.tsx|BitcoinCard.tsx]]

## Related

- [[docs/integrations/index|Service Integrations]]
- [[docs/integrations/tor|Tor Integration]]

---
title: Set up IPFS (Kubo)
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, ipfs, kubo, rpc]
description: Expose the Kubo RPC API safely to Watchman and add the IPFS node
aliases: [ipfs setup, set up ipfs, kubo setup]
---

# Set up IPFS (Kubo)

> [!abstract] What Watchman reads
> Kubo RPC read calls, all sent as `POST` because Kubo's RPC accepts nothing else: `version`, `id`,
> `swarm/peers`, `repo/stat`, `stats/bw`, `diag/sys`, `stats/bitswap`, `swarm/addrs/listen`,
> `pin/ls` and `stats/dht` (`apps/backend/src/domain/services/ipfs/IpfsService.ts`). It never pins,
> adds or changes config. Details: [[docs/integrations/ipfs|IPFS integration]].

## 1. Prepare the node

The Kubo RPC API has no user accounts: anyone who can reach it has full admin control of the node.
Watchman does not send RPC credentials, so the only protection is **where the API listens**.

- **Watchman on the same machine:** nothing to do. Kubo's default `Addresses.API` is
  `/ip4/127.0.0.1/tcp/5001`.
- **Watchman on another machine:** make the API listen on the node's LAN address only, then
  restart Kubo:
  ```bash
  ipfs config Addresses.API /ip4/192.168.1.40/tcp/5001
  ```
  Then allow port 5001 only from the Watchman host in the node's firewall. Don't use `0.0.0.0`
  on a machine with a public address, and never forward 5001 on your router.

> [!info] Kubo RPC authorization
> Kubo can require credentials on the RPC (`API.Authorizations`). Watchman has no field for them
> yet, so a node that enforces them will answer `401`/`403`. Use network restriction instead.

## 2. Credentials

None.

## 3. Add it in Watchman

**Settings → Services → + Add service → IPFS**

| Field   | Enter                                                       |
| ------- | ----------------------------------------------------------- |
| API URL | `http://127.0.0.1:5001` (default) or `http://192.168.1.40:5001`. The RPC port, not the gateway (8080). |

Watchman pings the host taken from the API URL.

## 4. Check it works

Save. The tile's service dot turns green once the service answers, and the tile shows the Kubo version, peer
count, repo size and bandwidth.

## Troubleshooting

| Symptom                                  | Likely cause                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `ipfs unreachable: …` / connection refused | The API listens on 127.0.0.1 only, or a firewall blocks 5001.               |
| `ipfs /api/v0/version returned 404`      | The URL points at the gateway (8080) instead of the RPC API (5001).           |
| `returned 401` or `403`                  | The node has RPC authorization turned on (see the note above).                |
| Pin count or DHT numbers missing         | Those calls are optional and refreshed slowly; large pin sets can exceed the timeout. Raise **Timeout** under Advanced. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/ipfs|IPFS integration]]

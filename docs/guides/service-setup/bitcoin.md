---
title: Set up Bitcoin Core
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, bitcoin, rpc, zmq, credentials, read-only, rpcwhitelist]
description: Create a whitelisted read-only RPC user in Bitcoin Core and add the node to Watchman
aliases: [bitcoin setup, set up bitcoin core, bitcoin rpc user]
---

# Set up Bitcoin Core

> [!abstract] What Watchman reads
> A batched JSON-RPC call per cycle with only read methods, plus optional ZMQ subscriptions: `hashblock` for instant new-block
> updates and `rawtx` to count new transactions
> (`apps/backend/src/domain/services/bitcoin/BitcoinService.ts`). Details:
> [[docs/integrations/bitcoin|Bitcoin integration]].

The full list of RPC methods Watchman calls:

`getblockchaininfo`, `getnetworkinfo`, `getmempoolinfo`, `uptime`, `getnettotals`,
`getmininginfo`, `getindexinfo`, `estimatesmartfee`, `getzmqnotifications`

## 1. Create a whitelisted RPC user

Watchman uses HTTP Basic auth with a user name and password. It can't read Bitcoin Core's
`.cookie` file. Bitcoin Core can limit a user to a list of RPC methods with `rpcwhitelist`, which
makes this user effectively read-only.

1. Generate an `rpcauth` line with the script that ships with Bitcoin Core:
   ```bash
   python3 share/rpcauth/rpcauth.py watchman
   ```
   It prints an `rpcauth=watchman:<salt>$<hash>` line and the password. Keep the password.
2. Add to `bitcoin.conf`:
   ```ini
   server=1
   rpcauth=watchman:<salt>$<hash>
   rpcwhitelist=watchman:getblockchaininfo,getnetworkinfo,getmempoolinfo,uptime,getnettotals,getmininginfo,getindexinfo,estimatesmartfee,getzmqnotifications
   rpcwhitelistdefault=0
   ```
   `rpcwhitelistdefault=0` matters: without it, setting any whitelist locks every *other* RPC user
   (including the cookie user that `bitcoin-cli` uses) out of all methods.
3. If Watchman runs on a different machine than the node, also let the RPC server listen on the
   LAN and accept only the Watchman host:
   ```ini
   rpcbind=127.0.0.1
   rpcbind=192.168.1.30        # the node's LAN address
   rpcallowip=127.0.0.1
   rpcallowip=192.168.1.10/32  # the Watchman machine
   ```
   RPC is plain HTTP. Never expose port 8332 to the internet.
4. Restart `bitcoind`.

> [!info] Source
> `rpcauth`, `rpcwhitelist`, `rpcwhitelistdefault`, `rpcbind` and `rpcallowip` are Bitcoin Core
> options (`bitcoind -help`). The method list above is taken from `BitcoinService.ts`. The
> whitelist was not tested against a live node in this repository; if a future Watchman version
> calls a new method, it will be listed here and on the integration page.

## 2. Turn on ZMQ (optional)

For new blocks to show up immediately instead of on the next 30-second poll, publish block hashes.
To also count transactions as they arrive, publish raw transactions:

```ini
zmqpubhashblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333   # optional
```

Use the node's LAN address instead of `127.0.0.1` if Watchman is on another machine. ZMQ has no
authentication and only publishes; firewall the ports to the Watchman host. `rawtx` sends every
mempool transaction, which is noticeable traffic on a busy node; leave it off if you don't need the count.

## 3. Add it in Watchman

**Settings → Services → + Add service → Bitcoin Node**

| Field                  | Enter                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| RPC URL                | `http://<node>:8332` (default `http://127.0.0.1:8332`; testnet/signet use other ports) |
| RPC user               | `watchman`                                                           |
| RPC password           | The password from step 1                                             |
| ZMQ hashblock endpoint | Same address as `zmqpubhashblock`, e.g. `tcp://192.168.1.30:28332`. Empty = polling only. |
| ZMQ rawtx endpoint     | Same address as `zmqpubrawtx`, e.g. `tcp://192.168.1.30:28333`, or empty. Shown as `zmqTxCount`. |

Watchman pings the host taken from the RPC URL.

## 4. Check it works

Save. The tile's service dot turns green once the service answers, and the tile shows chain, block height,
sync progress and peers. With ZMQ set, the stats also show `zmqEndpointMatch: true` when the port
you entered matches what the node reports from `getzmqnotifications`.

## Troubleshooting

| Symptom                                          | Likely cause                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `bitcoin rpc credentials not configured`         | RPC user or password is empty. Both are required.                             |
| `bitcoin rpc auth failed`                        | Wrong user or password, or the `rpcauth` line didn't load (restart bitcoind). |
| `bitcoin rpc user is not allowed one of the read methods (rpcwhitelist)` | A called method is missing from `rpcwhitelist`. The node also answers 403 when `rpcallowip` doesn't include the Watchman host, so check that too. |
| `bitcoin-cli` stopped working after the change   | `rpcwhitelistdefault=0` is missing.                                           |
| Connection refused from another machine          | `rpcbind` only listens on 127.0.0.1.                                          |
| `zmqEndpointMatch: false`                        | The ZMQ port in Watchman differs from `zmqpubhashblock`, or ZMQ isn't enabled. Polling still works. |
| `zmqError` / `zmqRawtxError` in the stats        | Watchman couldn't open that ZMQ subscription; the text says why. Polling still works. |
| "bitcoin responding but data incomplete"         | The node answered without chain data, usually while it is still starting.     |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/bitcoin|Bitcoin integration]]

---
title: Set up Alby Hub
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, albyhub, lightning, credentials, read-only]
description: Create a read-only Alby Hub token and add the hub to Watchman
aliases: [alby hub setup, set up alby hub]
---

# Set up Alby Hub

> [!abstract] What Watchman reads
> `GET /api/info` (public: version, running, backend type, network) and, with a token,
> `GET /api/apps`, `/api/balances` and `/api/channels`
> (`apps/backend/src/domain/services/albyHub/AlbyHubService.ts`). Details:
> [[docs/integrations/albyhub|Alby Hub integration]].

## 1. Prepare Alby Hub

Nothing to enable. Note the address of the hub's web interface, for example
`http://192.168.1.20:8080`. Health and basic info work without any token.

## 2. Create a read-only token (optional, for wallet and channel stats)

Alby Hub has no static API key. It issues a JWT when you unlock it, and the unlock request can ask
for a **read-only** token. Run this from any machine that can reach the hub, with your hub's unlock
password:

```bash
curl -s -X POST http://192.168.1.20:8080/api/unlock \
  -H 'Content-Type: application/json' \
  -d '{"unlockPassword":"YOUR-UNLOCK-PASSWORD","permission":"readonly","tokenExpiryDays":365}'
```

Copy the token from the reply.

- `permission: "readonly"` is what makes the token read-only. Don't leave it out.
- The token expires after `tokenExpiryDays` (30 if left out), and stops working if you change the
  unlock password. When it does, the wallet numbers disappear from the tile; repeat this step and
  paste the new token.
- Don't put the curl command in your shell history if the machine is shared (prefix it with a space
  in bash/zsh with `HISTCONTROL=ignorespace`, or type the password into a file).

> [!warning] Unverified
> The `/api/unlock` fields come from the getAlby/hub source (`http/http_service.go` at `d2c92a8`),
> as recorded on the integration page. They were not tried against a live hub, and the exact shape
> of the reply wasn't checked.

## 3. Add it in Watchman

**Settings → Services → + Add service → Alby Hub**

| Field             | Enter                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Base URL          | The hub address, e.g. `http://192.168.1.20:8080`                       |
| API token         | The token from step 2, or leave empty for health and info only         |
| Legacy probe mode | Leave **off**. Turn on only for an old hub that has no `/api/info`.    |

## 4. Check it works

Save. The tile's service dot turns green once the service answers, and the tile shows the hub version and
whether it is running. With a token, a **Wallet** group shows balances and channels.

## Troubleshooting

| Symptom                                   | Likely cause                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Tile up, but no wallet or app numbers     | No token, or the token expired or was revoked by a password change. Make a new one. |
| Warning that the hub is not running       | `/api/info` reports `running: false`: the hub is locked or its node is down. Unlock it in the Alby Hub UI. |
| Service down with legacy probe off        | Very old hub without `/api/info`. Turn legacy probe on.                            |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/albyhub|Alby Hub integration]]

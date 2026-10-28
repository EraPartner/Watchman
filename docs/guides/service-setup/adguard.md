---
title: Set up AdGuard Home
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, adguard, dns, credentials]
description: Prepare AdGuard Home, create a dedicated web user, and add it to Watchman
aliases: [adguard setup, set up adguard home]
---

# Set up AdGuard Home

> [!abstract] What Watchman reads
> Status, query statistics, filter lists, clients, DHCP leases and which protections are on, all through
> `GET /control/*` with HTTP Basic auth. It never changes settings
> (`apps/backend/src/domain/services/adguard/AdGuardService.ts`). Details:
> [[docs/integrations/adguard|AdGuard Home integration]].

## 1. Prepare AdGuard Home

Nothing to enable: the API is the same HTTP server as the AdGuard Home web interface. Note the
address you use to open the web interface, including the port, for example `http://192.168.1.2`
or `http://192.168.1.2:3000`.

## 2. Create credentials

AdGuard Home has no read-only role: every user listed in `AdGuardHome.yaml` is a full admin. The
safest option is a **separate user just for Watchman**, so you can remove it without changing your
own login.

1. Make a bcrypt hash of a new, long, random password, for example
   `htpasswd -B -C 10 -n -b watchman 'the-password'` (from `apache2-utils`).
2. Stop AdGuard Home and add the user under `users:` in `AdGuardHome.yaml`:
   ```yaml
   users:
     - name: admin          # your existing user, unchanged
       password: $2y$10$...
     - name: watchman
       password: $2y$10$... # the hash from step 1, without the "watchman:" prefix
   ```
3. Start AdGuard Home again.

> [!warning] Unverified
> The `users:` list and the `htpasswd -B` method come from the AdGuard Home wiki and were not
> tested in this repository. If you'd rather not edit the YAML, you can use your existing login;
> it has the same rights.

If you turned authentication off in AdGuard Home, leave both fields empty in Watchman.

## 3. Add it in Watchman

**Settings → Services → + Add service → AdGuard Home**

| Field    | Enter                                                                          |
| -------- | ------------------------------------------------------------------------------ |
| Base URL | The web interface address from step 1, e.g. `http://192.168.1.2`. No trailing path. |
| Username | `watchman` (or your login)                                                     |
| Password | The password from step 2                                                       |

Watchman pings the host taken from the Base URL, so the ping and the API always point at the same box.

## 4. Check it works

Save. The tile's service dot turns green once the API answers, and the tile shows
the AdGuard version, protection state, total and blocked queries.

## Troubleshooting

| Symptom                                    | Likely cause                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| `adguard /control/status returned 401`     | Wrong username or password, or the YAML edit didn't load (restart AdGuard Home). |
| Host indicator red but service green       | The host drops ping. Harmless; the API probe decides health.                     |
| Filter, DHCP or client numbers missing     | Those 7 endpoints are optional and refreshed every 10 minutes; a single failure leaves them empty until the next refresh. |
| `topUpstream` empty                        | AdGuard Home older than 0.107.30 doesn't report it.                              |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/adguard|AdGuard Home integration]]

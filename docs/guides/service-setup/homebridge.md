---
title: Set up Homebridge
type: guide
status: active
date: 2026-11-05
tags: [guide, setup, services, homebridge, config-ui-x, credentials]
description: Create a dedicated Homebridge Config UI X user and add Homebridge to Watchman
aliases: [homebridge setup, set up homebridge]
---

# Set up Homebridge

> [!abstract] What Watchman reads
> The Homebridge Config UI X API: server information, CPU, RAM, uptime, Homebridge status, child
> bridges, installed plugins and (only in insecure mode) accessories. All `GET`; the only `POST`
> is the login (`apps/backend/src/domain/services/homebridge/`). Details:
> [[docs/integrations/homebridge|Homebridge integration]].

## 1. Prepare Homebridge

Nothing to enable: Watchman talks to the Config UI X web server (`homebridge-config-ui-x`), the
same one you open in a browser, usually `http://<host>:8581`.

## 2. Create credentials

Create a **separate user for Watchman** in Config UI X (**User Accounts** in the menu), with a
long random password and without two-factor authentication: Watchman's login sends only a user
name and password.

**Admin or not.** The plugin list (`GET /api/plugins`) is admin-only in Config UI X: its
controller carries `AdminGuard` (checked in the published 4.76.0 code). So plugin counts and the
names of outdated plugins need the Administrator option. Without it, everything else still works
and only the plugin rows stay empty. Watchman never calls Config UI X's write endpoints either way.

> [!note] Wrong password
> If Config UI X refuses the login, Watchman waits 5 minutes, tries once more, and after a second
> refusal stops until you save the service again. It no longer retries on every poll.

Prefer user name and password over the **Auth token** field. Config UI X tokens expire; with a user
name and password Watchman logs in again by itself on a `401`. A pasted token is used until it
expires and then needs the password anyway.

**Accessories.** The accessory count needs Homebridge's *insecure mode* (`-I`), which lets anyone
with UI access control your accessories. Watchman doesn't need it for anything else; leave it off
unless you already use it.

## 3. Add it in Watchman

**Settings → Services → + Add service → Homebridge**

| Field                 | Enter                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Base URL              | `http://<host>:8581` (or `https://…` if you enabled HTTPS in Config UI X)                  |
| Username / Password   | The Watchman user from step 2                                                             |
| Auth token            | Leave empty                                                                               |
| Status / Version / Login path | Leave the defaults unless you run Config UI X behind a reverse proxy with a path prefix |
| Certificate fingerprint | For `https://` with Config UI X's own self-signed certificate: paste its SHA-256 fingerprint (`openssl s_client -connect <host>:8581 </dev/null \| openssl x509 -noout -fingerprint -sha256`). Watchman then trusts exactly that certificate. |
| Allow self-signed TLS | Fallback when you can't pin the certificate. It turns off certificate checks for this service, so use it only on a trusted network. The fingerprint wins when both are set. |

## 4. Check it works

Save. The tile's service dot turns green once the service answers, and the tile shows the Homebridge
version, host name, CPU and memory, and child bridges.

## Troubleshooting

| Symptom                                       | Likely cause                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `homebridge returned HTML login page`         | Base URL points at the web page, not the API, e.g. behind a proxy that redirects to a login. Check the URL and paths. |
| `homebridge /api/status/server-information returned 401` | Wrong user or password, or the user has two-factor enabled.          |
| TLS error with `https://`                     | Self-signed certificate. Tick **Allow self-signed TLS**, or give Config UI X a trusted certificate. |
| No plugin numbers                             | The user isn't an admin and your Config UI X version restricts the plugin list.  |
| No accessory count                            | Insecure mode is off. Expected.                                                  |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/homebridge|Homebridge integration]]

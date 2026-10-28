---
title: Set up Homebridge
type: guide
status: active
date: 2026-10-28
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

Try it **without** the Administrator option first. The status endpoints Watchman needs most should
work for any logged-in user; if the tile then shows no plugin information, the plugin list needs an
admin account on your Config UI X version.

> [!warning] Unverified
> Which Config UI X endpoints a non-admin user may read was not checked against a live
> Homebridge. Watchman treats plugins, CPU, RAM, uptime and child bridges as optional: if one fails,
> only that number is missing.

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
| Allow self-signed TLS | Only for `https://` with Config UI X's own self-signed certificate. It turns off certificate checks for this service, so use it only on a trusted network. |

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

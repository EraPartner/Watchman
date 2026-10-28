---
title: Set up a Synology NAS
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, synology, snmp, snmp-v3, dsm, credentials, least-privilege]
description: Enable SNMPv3 on a Synology NAS, optionally add a DSM account, and add the NAS to Watchman
aliases: [synology setup, set up synology, synology snmp]
---

# Set up a Synology NAS

> [!abstract] What Watchman reads
> - **SNMP v3 (normal health check):** model, DSM version, system status, CPU idle and temperature,
>   memory, uptime and interface byte counters.
> - **DSM Web API (optional extras):** `SYNO.Core.System.Utilization`, `SYNO.DSM.Info`,
>   `SYNO.Core.System.Status` and `SYNO.Storage.CGI.Storage` (volume and disk health), after a login.
>
> (`apps/backend/src/domain/services/synology/SynologyService.ts`,
> `apps/backend/src/infra/synology/dsmClient.ts`). Details: [[docs/integrations/synology|Synology integration]].

The least-privilege setup is **SNMP v3 only**. Add DSM only if you want the volume/disk health and
fan/power status it adds, and read the note in step 3. With DSM fields set but no SNMP user, health
falls back to a `SYNO.DSM.Info` call over DSM.

## 1. Prepare the NAS

Give the NAS a fixed IP address.

## 2. Enable SNMP v3

In DSM: **Control Panel → Terminal & SNMP → SNMP**.

1. Tick **Enable SNMP service**.
2. Leave SNMPv1/v2c off unless something else needs it.
3. Tick **SNMPv3 service** and fill in:
   - **Username**: e.g. `watchman`
   - **Protocol**: **SHA** (MD5 also works, but SHA is stronger), and a password of at least 8 characters
   - **Privacy**: tick it, **AES** (or DES), and a second password
4. Click **Apply**. If the DSM firewall is on, allow UDP 161 from the Watchman machine.

Watchman always uses SNMP v3 with authentication *and* privacy (authPriv): user name, auth password
and privacy password are all required. With any of them empty, the health check reports
"snmp credentials not configured" and the tile stays down.

## 3. DSM account (optional)

Watchman logs in to the DSM Web API with a user name and password and keeps the session. It sends no
two-factor code, so the account must not have 2-step verification.

- Create a **separate user** for Watchman (**Control Panel → User & Group → Create**), with a long
  random password, no shared-folder access and no application permissions it doesn't need.
- Try a normal (non-admin) user first. If DSM refuses an API for that account (DSM error 105),
  Watchman reports "synology dsm account lacks permission for … (code 105); use an account in the
  administrators group" and doesn't retry that login every poll.
- If you don't want an admin account for monitoring, leave the DSM fields empty. SNMP alone covers
  health, CPU, memory and network.

> [!warning] Unverified
> Which DSM APIs a non-admin account may call was not tested against a live NAS.

**DSM URL and TLS.** Use `https://<nas>:5001`. Watchman checks the certificate normally, which DSM's
default self-signed certificate fails. Either:
- **pin the self-signed certificate** (recommended on a LAN): get its fingerprint and paste it into
  **DSM certificate fingerprint (SHA-256)**. Watchman then trusts exactly that certificate and
  nothing else:
  ```bash
  openssl s_client -connect nas.local:5001 </dev/null | openssl x509 -noout -fingerprint -sha256
  ```
  If you later replace or renew the DSM certificate, update the fingerprint.
- or give DSM a certificate the Watchman machine already trusts (for example Let's Encrypt for a
  real domain name) and leave the fingerprint empty.

Avoid `http://<nas>:5000`: the DSM password then crosses the network unencrypted.

If DSM's **Auto block** is on, a wrong password could block the Watchman machine's IP. After a
rejected login Watchman waits 5 minutes before trying again (or until you save new credentials),
which keeps it from piling up failed attempts.

## 4. Add it in Watchman

**Settings → Services → + Add service → Synology NAS**

| Field                     | Enter                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Host                      | The NAS IP address                                          |
| SNMP user                 | The SNMPv3 username from step 2                             |
| SNMP auth key             | The SNMPv3 auth password                                    |
| SNMP priv key             | The SNMPv3 privacy password                                 |
| Auth protocol             | Same as DSM: `SHA` or `MD5`                                 |
| Priv protocol             | Same as DSM: `AES` or `DES`                                 |
| DSM URL / account / password | All three, or leave all three empty. DSM is used only when all three are set. |
| DSM certificate fingerprint (SHA-256) | Only for `https://` with DSM's self-signed certificate (see step 3). 64 hex digits; colons allowed. |

## 5. Check it works

After saving, the tile's service dot turns green once SNMP answers, with model, DSM version, CPU,
memory and network numbers. With DSM, the stats add volume and disk counts and fan/power status.

## Troubleshooting

| Symptom                                       | Likely cause                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| "snmp credentials not configured"             | One of SNMP user, auth key or priv key is empty, and DSM isn't configured either. |
| SNMP timeout                                  | SNMP service off, wrong protocol choice, wrong password, or UDP 161 blocked by the DSM firewall. |
| `synology dsm login failed: code …`           | Wrong account or password, 2-step verification on, or IP auto-blocked.           |
| `synology dsm: the certificate at … is not trusted` | DSM's self-signed certificate. Set the DSM certificate fingerprint.          |
| `… lacks permission for … (code 105)`         | The DSM account isn't allowed that API. Use an administrators-group account, or drop DSM. |
| DSM extras missing, SNMP fine                 | DSM fields incomplete, or one of the errors above. With SNMP configured, DSM failures don't turn the tile red. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/synology|Synology integration]]

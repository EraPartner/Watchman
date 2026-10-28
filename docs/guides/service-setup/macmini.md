---
title: Set up a Mac Mini
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, macmini, macos, ssh, credentials, least-privilege]
description: Create a standard macOS user with a restricted SSH key and add the Mac to Watchman
aliases: [mac mini setup, set up mac mini, macos ssh monitoring]
---

# Set up a Mac Mini

> [!abstract] What Watchman reads
> Health is an ICMP ping. Stats come from one SSH command per cycle that runs `uptime`, `df`,
> `vm_stat`, `pmset -g batt`, `top -l 1 -n 0 -s 0`, `ifconfig en0` and, if installed, `smctemp`
> (or `osx-cpu-temp`) and `smartctl` (`MAC_STATS_COMMANDS` in
> `apps/backend/src/domain/services/macMini/MacMiniService.ts`). Nothing needs admin rights.
> Details: [[docs/integrations/macmini|Mac Mini integration]].

## 1. Prepare the Mac

1. **Allow ping.** In **System Settings → Network → Firewall → Options**, make sure **Enable stealth
   mode** is off. With stealth mode on, the Mac ignores ping and Watchman shows it as down.
2. **Create a standard user** for Watchman: **System Settings → Users & Groups → Add User**, type
   **Standard** (not Administrator), for example `watchman`.
3. **Turn on Remote Login** in **System Settings → General → Sharing → Remote Login**, and under
   **Allow access for** choose **Only these users** and add `watchman`. Add your own user too if
   you SSH in yourself.
4. Optional, for CPU temperature and disk health: install `smctemp` (Apple Silicon) and
   `smartmontools` with Homebrew. Watchman adds `/opt/homebrew/bin` and `/usr/local/bin` to `PATH`
   for the temperature command. Without them those numbers are just missing.

## 2. Create an SSH key

Watchman logs in with a private key only (no SSH passwords). On the **machine that runs Watchman**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/watchman_macmini -C watchman
```

Then put the public key into `/Users/watchman/.ssh/authorized_keys` on the Mac Mini, with
restrictions in front of it:

```text
restrict,from="192.168.1.10" ssh-ed25519 AAAA… watchman
```

- `restrict` turns off port, agent and X11 forwarding and terminals; running commands still works.
- `from=` accepts the key only from the Watchman machine's address.

Make sure the folder and file belong to `watchman` with modes `700` and `600`.

> [!warning] Host key not checked
> Watchman's SSH client does not verify the Mac's host key (`apps/backend/src/infra/ssh/`), so it
> can't detect a machine impersonating the Mac on your network. Use it on a trusted LAN. This is why
> the key should belong to a standard user with the restrictions above.

## 3. Add it in Watchman

**Settings → Services → + Add service → Mac Mini**

| Field          | Enter                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| Host           | The Mac's IP address or host name                                                     |
| SSH user       | `watchman`                                                                            |
| SSH port       | `22` unless you changed it                                                            |
| SSH key path   | `~/.ssh/watchman_macmini`, the **private** key on the Watchman machine                |
| SSH passphrase | Only if you gave the key a passphrase                                                 |

Without SSH user and key path the tile still shows up/down from ping, but no stats.

## 4. Check it works

Save. The status dot turns green when the Mac answers ping. Within a stats cycle
(30 s) the tile shows uptime, load, memory, disk and network numbers.

## Troubleshooting

| Symptom                                      | Likely cause                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Down, but the Mac is on                      | Stealth mode or another firewall drops ping.                                     |
| `macMini ssh not configured`                 | SSH user or key path is empty.                                                   |
| `ssh: cannot read key at …`                  | The path is wrong, or it isn't readable by the user running Watchman.            |
| Authentication failed                        | Public key not in `authorized_keys`, wrong owner/permissions, `from=` doesn't match, or the user isn't allowed under Remote Login. |
| No temperature or disk health                | `smctemp` / `smartctl` not installed. `smartctl` may also need root to read the internal disk (unverified). |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/macmini|Mac Mini integration]]

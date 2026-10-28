---
title: Set up a Raspberry Pi
type: guide
status: active
date: 2026-10-28
tags: [guide, setup, services, raspberry-pi, ssh, pigpio, credentials, least-privilege]
description: Create a non-sudo SSH user on a Raspberry Pi, restrict pigpiod, and add the Pi to Watchman
aliases: [raspberry pi setup, set up raspberry pi, pi ssh monitoring]
---

# Set up a Raspberry Pi

> [!abstract] What Watchman reads
> - **Health:** ICMP ping, plus a connection to the `pigpiod` daemon (default port 8888) that reads
>   the current tick. The Pi counts as up if either answers.
> - **Stats (preferred, direct SSH):** one SSH command per cycle that runs `vcgencmd`
>   (`measure_temp`, `measure_clock arm`, `measure_volts core`, `get_throttled`) and reads
>   `/proc/loadavg`, `/proc/meminfo`, `/proc/uptime`, `/proc/cpuinfo` and `/etc/os-release`.
> - Hardware revision and pigpio version over the `pigpiod` socket when it answers; otherwise the
>   revision and model come from `/proc/cpuinfo`. Stats keep working without pigpiod.
>
> Watchman never writes GPIO ([[docs/adr/032-monitoring-only-no-service-control|ADR-032]];
> `apps/backend/src/domain/services/raspberryPi/`). Details:
> [[docs/integrations/raspberry-pi|Raspberry Pi integration]].

## 1. Prepare the Pi

1. Give the Pi a fixed IP address.
2. **SSH:** enable it (`sudo raspi-config` → Interface Options → SSH).
3. **pigpiod (optional):** used for the second health check and the hardware revision. Install
   `pigpio` and enable the daemon. pigpiod's socket accepts GPIO *writes* from anyone who can reach
   it, so limit it:
   - Watchman on the Pi itself: keep pigpiod on localhost only (`pigpiod -l`).
   - Watchman elsewhere: allow only the Watchman host (`pigpiod -n 192.168.1.10`) and firewall port
     8888 to that host.

   pigpio does not support the Raspberry Pi 5. On a Pi 5 skip pigpiod; the service dot stays red
   but the tile is up as long as ping answers, and SSH stats still work.

> [!warning] Unverified
> The `pigpiod -l` / `-n` options and the Pi 5 limitation come from the pigpio documentation and
> were not tested here.

## 2. Create a user and SSH key

Use a user without `sudo`. It only needs to be in the `video` group, which `vcgencmd` requires.

On the Pi:

```bash
sudo adduser --disabled-password --gecos "" watchman
sudo usermod -aG video watchman
```

On the **machine that runs Watchman**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/watchman_pi -C watchman
```

Put the public key into `/home/watchman/.ssh/authorized_keys` on the Pi (folder `700`, file `600`,
owned by `watchman`), restricted to the Watchman host:

```text
restrict,from="192.168.1.10" ssh-ed25519 AAAA… watchman
```

`restrict` turns off forwarding and terminals; running commands still works.

**Pin the Pi's host key** so Watchman refuses a machine pretending to be the Pi. On the Pi run
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` and copy the `SHA256:…` part. Without a pin
Watchman accepts any host key.

## 3. Add it in Watchman

**Settings → Services → + Add service → Raspberry Pi**

| Field          | Enter                                                                |
| -------------- | -------------------------------------------------------------------- |
| Host           | The Pi's IP address                                                  |
| Agent port     | `8888` (pigpiod) unless you changed it                               |
| SSH user       | `watchman`                                                           |
| SSH port       | `22`                                                                 |
| SSH key path   | `~/.ssh/watchman_pi`, the **private** key on the Watchman machine    |
| SSH passphrase | Only if the key has one                                              |
| SSH host key fingerprint | The `SHA256:…` value from step 2 (recommended)                     |
| Mac Mini host / SSH … / host key / Node binary path / rpi CLI path | Leave empty. These are the legacy relay, used only when direct SSH isn't set. |

## 4. Check it works

After saving, the tile shows up when ping or pigpiod answers. Within a stats cycle it shows CPU
temperature, clock, core voltage, throttling flags, load, memory and uptime.

## Troubleshooting

| Symptom                                      | Likely cause                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `pigpiod unavailable: …`                     | pigpiod not running, listening on localhost only, `-n` doesn't include Watchman, or a Pi 5. |
| `pi direct ssh produced no output`           | SSH logged in but every command failed. Check the user can run `vcgencmd` (the `video` group). |
| Temperature/voltage empty, `/proc` stats fine | The user isn't in the `video` group.                                        |
| `ssh host key mismatch for …`                | The Pi's host key changed (reinstalled SD card) or something else answers at that address. Check, then update the fingerprint. |
| `ssh: cannot read key at …`                  | Wrong key path, or not readable by the user running Watchman.                |
| Throttling flag non-zero                     | Real under-voltage or heat on the Pi; see [[docs/integrations/raspberry-pi#Throttling Detection\|Throttling Detection]]. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/raspberry-pi|Raspberry Pi integration]]

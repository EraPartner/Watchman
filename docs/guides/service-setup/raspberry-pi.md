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
>   `/proc/loadavg`, `/proc/meminfo`, `/proc/uptime`, `/proc/stat` (first line), `/proc/net/dev`,
>   `/proc/cpuinfo` and `/etc/os-release`, plus `df -kP /`, `findmnt -no OPTIONS /` and
>   `systemctl --failed` (`PI_DYNAMIC_COMMANDS` / `PI_STATIC_COMMANDS` in
>   `apps/backend/src/domain/services/raspberryPi/PiStatsCollector.ts`). None needs root.
> - Hardware revision and pigpio version over the `pigpiod` socket when it answers; otherwise the
>   revision and model come from `/proc/cpuinfo`. Stats keep working without pigpiod.
>
> Watchman never writes GPIO ([[docs/adr/032-monitoring-only-no-service-control|ADR-032]];
> `apps/backend/src/domain/services/raspberryPi/`). Details:
> [[docs/integrations/raspberry-pi|Raspberry Pi integration]].

## 1. Prepare the Pi

1. Give the Pi a fixed IP address.
2. **SSH:** enable it (`sudo raspi-config` → Interface Options → SSH).
3. **pigpiod (optional, legacy):** used only for a second health check and the hardware
   revision, which direct SSH also reads from `/proc/cpuinfo`. With direct SSH set up you can skip
   it. If you do run it: pigpiod has no authentication and its socket accepts GPIO *writes* from
   anyone who can reach it, so limit it:
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

**Install the read-only probe script (recommended).** It limits the key to Watchman's fixed list
of read commands, enforced by the Pi's own `sshd`, so a leaked key can't run anything else. Copy
[`packaging/probes/watchman-probe-pi.sh`](../../../packaging/probes/watchman-probe-pi.sh) to the Pi:

```bash
sudo install -o root -g root -m 755 watchman-probe-pi.sh /usr/local/bin/watchman-probe
```

Put the public key into `/home/watchman/.ssh/authorized_keys` on the Pi (folder `700`, file `600`,
owned by `watchman`), restricted to the probe and the Watchman host:

```text
restrict,command="/usr/local/bin/watchman-probe",from="192.168.1.10" ssh-ed25519 AAAA… watchman
```

- `command=` makes `sshd` run the probe script for every login with this key, whatever command
  the client sends. The script prints exactly what Watchman would have asked for.
- `restrict` turns off forwarding and terminals.
- Update the script when you update Watchman (it's generated from the code and a test keeps them
  in sync). An old script still works; newer numbers just stay empty.
- If you skip the script, leave out `command="…"`. Watchman then sends the same commands itself.

**Pin the Pi's host key** so Watchman refuses a machine pretending to be the Pi. On the Pi run
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` and copy the `SHA256:…` part. Without a pin
Watchman trusts the first host key it sees after each start, refuses a different key until
restart, and logs the fingerprint it saw (`ssh host key not pinned`) so you can pin it.

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
| Mac Mini host / SSH … / host key / Node binary path / rpi CLI path | Leave empty. These are the legacy relay: a fallback used only when direct SSH isn't set or fails. It needs pigpiod reachable from the Mac, which widens who can write GPIO, so prefer direct SSH. |

## 4. Check it works

After saving, the tile shows up when ping or pigpiod answers. Within a stats cycle it shows CPU
temperature, clock, core voltage, throttling flags, CPU usage (from the second poll), load,
available memory and swap, root disk usage, whether `/` is mounted read-only, failed systemd
units, network rates and uptime.

## Troubleshooting

| Symptom                                      | Likely cause                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `pigpiod unavailable: …`                     | pigpiod not running, listening on localhost only, `-n` doesn't include Watchman, or a Pi 5. |
| `pi direct ssh produced no output`           | SSH logged in but every command failed. Check the user can run `vcgencmd` (the `video` group). |
| Temperature/voltage empty, `/proc` stats fine | The user isn't in the `video` group.                                        |
| "Root mounted read-only: true", tile red     | The kernel remounted `/` read-only after I/O errors, usually a failing SD card. Back it up and replace it. |
| Failed systemd units listed                  | `systemctl --failed` on the Pi shows the same list; Watchman only reads it.    |
| Relay error `Unexpected token` / JSON        | The Mac's relay key has `command=` set to the Mac probe script. Use a separate relay key without it. |
| `ssh host key mismatch for …`                | The Pi's host key changed (reinstalled SD card) or something else answers at that address. Check, then update the fingerprint. |
| `ssh: cannot read key at …`                  | Wrong key path, or not readable by the user running Watchman.                |
| Throttling flag non-zero                     | Real under-voltage or heat on the Pi; see [[docs/integrations/raspberry-pi#Throttling Detection\|Throttling Detection]]. |

## Related

- [[docs/guides/service-setup/index|Service Setup Guides]]
- [[docs/integrations/raspberry-pi|Raspberry Pi integration]]

---
title: Deploying Watchman to a Raspberry Pi
type: guide
status: superseded
date: 2026-05-07
tags: [guide, deployment, raspberry-pi, systemd, nvm, lan, split-deploy, archived, superseded-by-adr-019]
description: Step-by-step guide for installing the Watchman backend on a Raspberry Pi — SUPERSEDED by ADR-019 (split deploy removed, archived for historical reference)
aliases: [pi deploy, raspberry pi deploy, deploying to pi, split deploy guide]
---

# Deploying Watchman to a Raspberry Pi (ARCHIVED)

> [!warning] SUPERSEDED — Archived for Historical Reference
> This guide describes the split-deploy architecture introduced in [[docs/adr/018-split-deploy-pi-backend|ADR-018]], which was removed as part of [[docs/adr/019-revert-split-deploy-and-remove-time-series|ADR-019]]. Watchman now runs as a standalone Electron app with an embedded backend subprocess on a single machine. The document below is preserved for historical context.
>
> To run Watchman, see [[docs/guides/running-the-desktop-app|Desktop App Guide]] instead.

## Audience and Assumptions

- Single-user, LAN-only deployment — no auth, no TLS, no reverse proxy. See [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]].
- Raspberry Pi 4/5 with Pi OS 64-bit Lite. Works on arm64 SBCs generally.
- Pi reachable from the Mac on the same Wi-Fi / LAN.
- The Pi is a dedicated host — no other service on port 3001.

## One-time Pi setup

### 1. Prepare the Pi

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git build-essential python3 curl
```

`build-essential` and `python3` are only needed if `@duckdb/node-api` falls back to compiling from source on your arm64 image.

### 2. Install Node 22 via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# new shell (or: source ~/.bashrc)
nvm install 22
nvm alias default 22
node -v   # → v22.x.x
which node
```

Record the output of `which node` — you will paste it into the systemd unit.

### 3. Create the data directory

```bash
mkdir -p ~/.watchman/data
```

Kept outside the repo so `git clean -fdx` or a reclone cannot wipe DuckDB history.

### 4. Clone and build

```bash
git clone https://github.com/EraPartner/watchman ~/watchman
cd ~/watchman
npm install
npm run -w apps/backend build
```

### 5. Install the systemd unit

```bash
sudo cp ~/watchman/apps/backend/deploy/watchman.service /etc/systemd/system/watchman.service
sudoedit /etc/systemd/system/watchman.service
```

Edit `ExecStart=` to match your `which node` output, for example:

```ini
ExecStart=/home/pi/.nvm/versions/node/v22.11.0/bin/node dist/index.js
```

> [!warning] nvm + systemd path pitfall
> systemd does not source `~/.bashrc`, so `node` is not on PATH for the service. You must either use an absolute path (above) or wrap the command: `ExecStart=/bin/bash -lc 'exec node dist/index.js'`. If you later run `nvm install 22.X.Y` for a newer minor, the absolute path changes — `systemctl edit watchman` to update it, or symlink once with `sudo ln -s $(which node) /usr/local/bin/watchman-node` and reference the stable symlink in ExecStart.

Reload and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now watchman
```

### 6. Verify

```bash
sudo systemctl status watchman           # active (running)
curl http://localhost:3001/meta/health   # {"data":{"status":"ok",...}}
journalctl -u watchman -n 100 --no-pager
ls -l ~/.watchman/data/master.key        # mode -rw------- (0600)
hostname -I                              # note the Pi's LAN IP
```

### 7. Reserve a DHCP lease

On your router, pin the Pi's MAC address to a static IP — the Electron client stores the URL as entered. If the Pi's IP changes, users must re-pair via the wizard's **Change URL** flow.

### 8. Open the port if `ufw` is enabled

Default Pi OS has no firewall. If you've enabled `ufw`:

```bash
sudo ufw allow 3001/tcp
```

## Pairing the Mac client

1. Launch the Watchman desktop app.
2. The setup wizard opens on **Connect**.
3. Enter `http://<pi-ip>:3001` (for example `http://192.168.1.10:3001`). Use `http` — not `https` — on the LAN.
4. Click **Test & Save**. The wizard probes `/meta/health`, persists the URL to `{userData}/client-config.json`, then reloads.
5. Continue through Welcome → Pick → Configure → Review as usual.

To re-pair (Pi moved, IP changed, or switching hosts) click **Change URL** in the offline banner. The client clears `apiUrl` and reopens on **Connect**.

## Update recipe

On the Pi:

```bash
cd ~/watchman
git pull
npm install
npm run -w apps/backend build
sudo systemctl restart watchman
```

`~/.watchman/data/watchman.duckdb` is preserved across restarts — it lives outside the repo.

The Mac desktop app only needs a rebuild when the Electron main / preload / renderer code changes. For backend-only updates (most integrations, polling, API) a Pi restart is sufficient.

## Offline UX

The Mac polls `GET /meta/health` every 10s with a 3s timeout. Three consecutive failures flip the UI into offline mode:

- A fixed-top banner appears: "Cannot reach backend at `http://<pi-ip>:3001`."
- **Retry** probes immediately (useful after you restart the unit on the Pi).
- **Change URL** wipes the stored `apiUrl` and reloads the wizard — use this when the Pi's address changed or you're pointing a different client at the same Pi.

When the Pi is back and the next probe returns 200, the banner clears on its own.

## Backup

`~/.watchman/data/watchman.duckdb` is the single source of truth. Options:

- Periodic `rsync` to another host: `rsync -a ~/.watchman/data/ <backup-host>:~/watchman-backups/$(date +%F)/`
- Logical export via the backend: `curl http://localhost:3001/config/export > export-$(date +%F).json` — covers service configuration but **not** time-series history.
- Snapshot the whole data dir before a risky upgrade: `sudo systemctl stop watchman && cp -a ~/.watchman/data ~/.watchman/data.bak && sudo systemctl start watchman`.

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| `systemctl status watchman` → `status=203/EXEC` | Absolute Node path in `ExecStart` is wrong — rerun `which node`, update unit, `daemon-reload`, `restart`. |
| `npm install` hangs on `@duckdb/node-api` compile | `build-essential python3` missing — `sudo apt install -y build-essential python3`, retry. |
| `curl localhost:3001/meta/health` → connection refused | Unit running? `journalctl -u watchman -n 200` for the boot error. `DATA_DIR` unwritable is a common cause — confirm `~/.watchman/data` is owned by `pi`. |
| Mac banner stays offline even after `systemctl start watchman` | From the Mac: `curl http://<pi-ip>:3001/meta/health`. If it works, click **Retry**. If it doesn't, check the router ACL / Wi-Fi isolation. |
| Banner flips offline intermittently | 3-failure threshold hides short blips (≤20s). Frequent offline = poller or DB is stalling. Check `journalctl -u watchman -f` during a blip. |

## Related

- [[docs/adr/018-split-deploy-pi-backend|ADR-018]] — Decision record for this deployment model
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — Why the LAN-only, no-auth posture is acceptable
- [[docs/adr/016-electron-desktop-wrapper|ADR-016]] — Electron wrapper (origin of the `watchman://` protocol)
- [[docs/guides/running-the-desktop-app|Running the Desktop App]] — Local dev with the Electron client
- [[apps/backend/deploy/watchman.service|watchman.service]] — Unit file source
- [[apps/backend/src/config/masterKey.ts|masterKey.ts]] — Auto-provisioned encryption key

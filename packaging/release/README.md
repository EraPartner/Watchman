# Watchman **VERSION** — macOS

Watchman is a self-hosted dashboard that monitors your home-lab services
(Bitcoin node, IPFS, qBittorrent, Tor, AdGuard, Synology, Hue, routers, and
more). Everything runs on your machine — Watchman only talks to the services
_you_ configure, on your own network.

`Watchman.app` is a self-contained Electron app. It bundles its own backend and
runs it for you — **there is nothing else to install** (no Docker, no Node, no
database server). One app, one window.

## What's in this release

| File                                 | Purpose                                   |
| ------------------------------------ | ----------------------------------------- |
| `Watchman-__VERSION__-arm64.dmg`     | The application installer (Apple Silicon) |
| `Watchman-__VERSION__-x64.dmg`       | The application installer (Intel)         |
| `Watchman-__VERSION__-arm64-mac.zip` | Same app as a zip; alternative to the DMG |
| `*.sha256`                           | Checksums for each artifact above         |

## Requirements

- macOS 12 (Monterey) or newer
- Apple Silicon (M1+) or Intel
- A few hundred MB of free disk space
- No internet connection required to run (Watchman reaches your services on your
  LAN; it does not phone home)

## Install

### 1. Verify the download (optional but recommended)

```sh
shasum -a 256 -c Watchman-__VERSION__-arm64.dmg.sha256
```

The line should end with `OK`.

### 2. Install the app

1. Double-click the `.dmg`.
2. Drag `Watchman.app` to the `Applications` folder.
3. Eject the DMG (drag it to the Trash).

### 3. First launch

Right-click `Watchman.app` in `/Applications` → **Open** → **Open**.

> macOS shows **"Watchman.app cannot be opened because the developer cannot be
> verified."** because the build is signed with an ad-hoc signature (free)
> rather than a paid Apple Developer ID. The right-click → Open bypass is only
> needed on the **first** launch. After that, double-click works like any other
> app.

On first launch Watchman:

1. Starts its bundled backend and generates a local encryption key.
2. Opens the dashboard. Run the in-app setup to add your first service.

First launch is typically a few seconds.

## Daily use

Double-click `Watchman.app`. Closing the window quits the app and stops the
backend; reopening starts it again.

## Security model

Watchman is single-user and assumes a **trusted network** — there is no login by
design (see the project's ADR-017 / ADR-025). The bundled backend binds to
`127.0.0.1` (loopback only) inside the app, so it is not reachable from other
machines. Service secrets you enter are encrypted at rest with a key generated
on first launch and stored in your user data directory.

## Updating

1. Download the new release's `.dmg`.
2. Drag the new `Watchman.app` over `/Applications/Watchman.app`. Finder will
   ask to replace.
3. Open the app. Your services, profiles, and settings are preserved.

## Where your data lives

| Location                                               | Contents                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `~/Library/Application Support/Watchman/data/`         | DuckDB config store (services, profiles) + the encryption key |
| `~/Library/Application Support/Watchman/settings.json` | Desktop settings (window size/position)                       |
| `~/Library/Application Support/Watchman/logs/`         | Backend log for the current session                           |

## Backup & restore

Use the in-app **Backup** page (top navigation). To back up manually, copy the
`data/` directory above while the app is closed.

## Troubleshooting

| Symptom                                           | Fix                                                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Watchman.app is damaged and can't be opened"** | In Terminal: `xattr -cr /Applications/Watchman.app`, then try again. Or right-click → Open → Open.                                                       |
| **Window shows an error screen on launch**        | Click **Open logs** on that screen (or open `~/Library/Application Support/Watchman/logs/watchman-desktop.log`) and read the last error, then **Retry**. |
| **Reset everything**                              | Quit the app, then: `rm -rf "$HOME/Library/Application Support/Watchman"`. This deletes all configured services and the encryption key.                  |

## Uninstall

```sh
rm -rf /Applications/Watchman.app
rm -rf "$HOME/Library/Application Support/Watchman"
```

## Why is the app unsigned?

Apple's Developer ID program costs $99/year. Until that is in place, the app
uses an **ad-hoc** signature — enough for macOS to load the binary, not enough
for Gatekeeper to trust it without a one-time right-click → Open. There is no
security difference once you have run the app once and accepted it.

## Build from source instead

You don't need this release to run Watchman — from a clone of the repo:

```sh
./install.sh         # builds Watchman.app and installs it to /Applications
# or, for development:
npm run deps:ci && npm run electron:dev
```

## Source code & issues

https://github.com/EraPartner/Watchman

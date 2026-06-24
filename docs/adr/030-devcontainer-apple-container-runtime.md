---
title: "ADR-030: Devcontainer Apple/Container Runtime"
type: adr
status: Accepted
date: 2026-06-24
tags:
  [adr, devcontainer, apple-container, infrastructure, macos, security, tooling]
description: Migrate the Watchman Claude sandbox from Docker / Docker-Compose / the devcontainer CLI to Apple's native container runtime (apple/container), removing the Docker Desktop dependency on macOS while preserving the egress lock and hardening.
aliases: [adr-030, apple-container, devcontainer runtime, container migration]
---

# ADR-030: Devcontainer Apple/Container Runtime

> [!abstract] Summary
> Migrate the Watchman Claude sandbox off Docker / Docker-Compose / the devcontainer CLI onto Apple's native `container` runtime (apple/container), driven by a host launcher (`.devcontainer/bin/claude`) that does `container build` + `container run` + `container exec`. The hardened image, two-layer egress lock, mounts, lifecycle, and credential flow are preserved.

## Status

- **Status**: Accepted
- **Date**: 2026-06-24
- **Supersedes**: [[docs/adr/024-claude-code-devcontainer|ADR-024]] (Docker / devcontainer-CLI runtime)

## Context

[[docs/adr/024-claude-code-devcontainer|ADR-024]] established the hardened sandbox for running the Claude CLI in `--dangerously-skip-permissions` mode. Its **runtime** was Docker: a Docker Compose file (`compose.yaml`) and/or `devcontainer.json` consumed by the devcontainer CLI (`devcontainer up` / `devcontainer exec`) and the VS Code Dev Containers extension, all on top of Docker Desktop. The hardening (non-root `dev` user, in-container squid SNI proxy + iptables egress lock, sanitized `~/.claude` staging, Keychain-backed auth) was sound; only the **outer runtime** is being changed here.

Reasons to move off Docker on macOS:

- **Docker Desktop overhead** — a heavyweight Linux VM and background daemon, significant RAM, and licensing terms that changed for commercial use.
- **devcontainer-CLI coupling** — `devcontainer up`/`exec` and the Dev Containers extension required `@devcontainers/cli` and parsed `devcontainer.json` / `compose.yaml`; this added moving parts and a feature system (`node:1`, `anthropics/claude-code:1.0`) that had to resolve at build time.
- **A native alternative exists** — Apple's [`container`](https://github.com/apple/container) runtime uses the macOS Virtualization framework directly (a lightweight per-container VM) and exposes a `container build` / `run` / `exec` CLI with semantics close to `docker`, without Docker Desktop.

Key runtime deltas that shaped this migration:

- **No feature system.** apple/container has no devcontainer features, so Node 24 and the Claude CLI are installed by the `Dockerfile` itself (static Node build + `npm i -g @anthropic-ai/claude-code`) rather than layered by the CLI.
- **No `--security-opt`.** apple/container has no `--security-opt no-new-privileges` (or seccomp-profile) flag. The per-container **VM boundary** is the isolation control. The image compensates by stripping all setuid/setgid bits image-wide and shipping no `sudo`, so there is no escalation path to neutralize in the first place.
- **`--init`, `--tmpfs`.** `--init` replaces compose's `init: true`; `--tmpfs` takes a bare path (no options string).
- **Native named volumes.** `watchman-claude` is a native apple/container volume; the root entrypoint can `chown` its mountpoint so a fresh volume inherits `dev` ownership.
- **No healthcheck runner.** apple/container 1.0.0 does not run image `HEALTHCHECK`s; the `Dockerfile`'s healthcheck is a no-op under this runtime. Real supervision is the entrypoint keep-alive loop (squid auto-restart).

## Decision

Replace the Docker/devcontainer-CLI runtime with an apple/container launcher:

- **No `compose.yaml`, no `devcontainer.json`.** Neither exists in the repo. There is no devcontainer-CLI or Dev Containers extension dependency.
- **Host launcher** at `.devcontainer/bin/claude` (invoked via the `watchman-claude` fish function) drives everything: it stages a sanitized `~/.claude`, runs `container build -t watchman-dev:latest .devcontainer`, then an idempotent `container run -d --name watchman-dev …` (reusing a running container, starting a stopped one, else creating it), replays `post-create.sh` (once) / `post-start.sh` (every start) as `--user dev`, forwards the Claude OAuth token from the Keychain at `container exec` time, and runs the interactive session.
- **`WATCHMAN_REBUILD=1 watchman-claude`** forces a full refresh: it rebuilds the image **and** recreates the `watchman-dev` container so a new image / allowlist takes effect.
- **Shell access** is `container exec -it --user dev watchman-dev bash`.
- **The same hardened image** (`Dockerfile`), two-layer egress lock (`init-firewall.sh` iptables default-deny + proxy-UID-only, plus the squid SNI peek+splice hostname allowlist baked at `/etc/squid/allowlist.txt`), mounts, lifecycle scripts, credential forwarding, and config-sync behaviour are preserved from ADR-024.
- **Egress allowlist** is the hostname allowlist baked at `/etc/squid/allowlist.txt`, generated by `devcontainer-egress/sync.sh` as the shared `base-allowlist.txt` plus Watchman's `allowlist.extra.txt`. (This is a hostname allowlist enforced via TLS SNI — not an iptables IP-allowlist.)
- **Published ports** 5173, 3001, 4173 are published to `127.0.0.1` via `-p` flags on `container run`, with the same port set baked into `/etc/egress/inbound-ports` for the firewall's inbound ACCEPT.
- **A launch-integrity gate** (`watchman-verify-pins`, baked into the image) is mandatory: the launcher aborts fail-closed if the checker is missing or if a tool's SHA-256 fingerprint has drifted.

`container` must be installed and `container system start` must have been run before invoking the launcher. The launcher checks both preconditions and exits with a clear error if either is missing.

## Consequences

### Positive

- Docker Desktop is no longer required on the developer's Mac; `container system start` is the only runtime prerequisite. No `@devcontainers/cli` either.
- Lighter-weight VM startup — apple/container uses the macOS Virtualization framework directly.
- Native named volumes let the entrypoint `chown` the `~/.claude` mountpoint so a fresh volume inherits `dev` ownership.
- Docker Desktop licensing concerns for commercial use are eliminated.
- The launcher powers the VM down on session exit by default (`WATCHMAN_STOP_ON_EXIT=0` to keep warm), so an idle sandbox stops pinning its 4 GB.

### Negative

- **macOS / Apple Silicon only** — apple/container is macOS-native; there is no Linux or Windows path for this launcher.
- **No `--security-opt`** — `no-new-privileges` and seccomp profiles available under Docker are not available. The per-container VM boundary provides the isolation; the image strips setuid/setgid bits and ships no `sudo` so there is no escalation primitive to gate.
- **No compose / devcontainer.json** — tooling that auto-detected a compose file or `devcontainer.json` (e.g. the VS Code Dev Containers extension) no longer finds one. The sandbox is launched exclusively via `bin/claude`.
- **Image `HEALTHCHECK` is inert** — apple/container 1.0.0 has no healthcheck runner; supervision is the entrypoint keep-alive loop instead.

### Risks

- **Runtime maturity** — apple/container is comparatively new; behaviour around networking, volumes, and signal handling can differ from Docker. The entrypoint includes a network pre-flight (warns on missing interface/default route after host sleep/resume) and graceful-shutdown handling to absorb some of this.
- **Stale baked allowlist on reuse** — because the allowlist is baked into the image, a long-lived reused container can be enforcing a stale copy after a `sync.sh` change. The launcher warns when the running container's allowlist differs from the on-disk one and tells the operator to rebuild.

## Alternatives Considered

| Alternative                                         | Why Rejected                                                                                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stay on Docker Desktop + devcontainer CLI (ADR-024) | Heavyweight VM + daemon, RAM cost, commercial licensing, and the extra `@devcontainers/cli` / feature-system moving parts — all avoidable on macOS now that a native runtime exists. |
| Colima / OrbStack as the Docker engine              | Removes Docker Desktop but keeps the Docker/compose/devcontainer-CLI stack and its complexity; doesn't use the native macOS virtualization path.                                     |
| Lima VM + manual scripts                            | More moving parts than apple/container's first-class `container` CLI, with no devcontainer ergonomics gained.                                                                        |

## References

- [[docs/adr/024-claude-code-devcontainer|ADR-024]] — original hardened devcontainer (Docker / devcontainer-CLI runtime; superseded by this ADR)
- [[docs/guides/devcontainer|Devcontainer Guide]] — contributor-facing setup instructions
- [[docs/architecture/index|Architecture Overview]]
- `.devcontainer/bin/claude` — the apple/container launcher
- `.devcontainer/Dockerfile`
- `.devcontainer/init-firewall.sh`
- `.devcontainer/entrypoint.sh`
- `.devcontainer/post-start.sh`
- `.devcontainer/README.md`

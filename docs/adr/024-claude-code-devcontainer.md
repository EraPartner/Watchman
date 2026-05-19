---
title: "ADR-024: Hardened Devcontainer for Claude CLI in --dangerously-skip-permissions Mode"
type: adr
status: Accepted
date: 2026-05-19
tags: [adr, devcontainer, security, docker, claude, tooling, firewall, auth]
description: Debian-based devcontainer with iptables default-deny egress, non-root user, Keychain-backed auth, and host ssh-agent forwarding for running Claude CLI in --dangerously-skip-permissions mode without exposing the host.
aliases: [adr-024, devcontainer adr, claude devcontainer, hardened container, skip-permissions container]
---

# ADR-024: Hardened Devcontainer for Claude CLI in --dangerously-skip-permissions Mode

> [!abstract] Summary
> A hardened Docker devcontainer isolates Claude CLI's `--dangerously-skip-permissions` mode from the host OS using a non-root Debian container, iptables default-deny egress, macOS Keychain-backed auth, volume-isolated `~/.claude`, and host ssh-agent forwarding for commit signing.

## Status

- **Status**: Accepted
- **Date**: 2026-05-19

## Context

Claude CLI's `--dangerously-skip-permissions` mode removes all tool-use confirmation prompts, enabling unattended agentic workflows. Without isolation, this exposes the host: Claude can read arbitrary files, exfiltrate secrets, mutate the global `~/.claude` config while a host claude session is also writing to it (causing JSON corruption), and reach every service on the LAN.

Watchman is a home-lab monitoring dashboard that regularly polls LAN services (Bitcoin node, IPFS, qBittorrent, Tor, AdGuard, Synology, Homebridge, Roon, Philips Hue, routers, etc). The same network reachability that makes Watchman useful makes the devcontainer's threat surface wider than a typical web app.

The devcontainer pattern here follows the same structure as the Vision project's hardened container, adapted for Watchman's specific tech stack and network profile.

**Specific threats addressed:**

1. **Host file exfiltration** — Claude reading `~/.ssh/id_ed25519`, `~/.aws/credentials`, API key files outside the workspace.
2. **LAN probing** — Claude making connections to home-lab service endpoints it shouldn't touch during code work.
3. **`~/.claude` corruption** — Concurrent writes from host claude and container claude racing on `~/.claude.json` and settings files.
4. **Credential leak** — Container process acquiring a long-lived credential stored plaintext on disk.

## Decision

A `.devcontainer/` directory at the repo root provides a complete hardened dev environment. Key decisions within it:

### Base image and user

`debian:bookworm-slim` with a `dev` user at UID 1000. The UID matches the typical macOS host user so bind-mounted workspace files have consistent ownership. No blanket `sudo` — only a narrow sudoers allowlist covering `iptables`, `ipset`, `service`, `init-firewall.sh`, `chown`, and `chmod`.

### Default-deny egress firewall

`init-firewall.sh` runs via `post-start.sh` on every container start. It uses `iptables` + `ipset` to implement:

- Loopback fully allowed (backend ↔ frontend communicate on `127.0.0.1`)
- DNS restricted to the resolver from `/etc/resolv.conf` (prevents DNS tunneling, following the pattern noted in anthropics/claude-code#36907)
- Outbound to a resolved-IP allowlist only: Anthropic API, claude.ai, npm registry, GitHub, PyPI, Debian apt mirrors, nodejs.org, VS Code marketplace
- All other egress dropped (including LAN by default)

**LAN-block trade-off**: Watchman's production purpose is polling LAN services, but the devcontainer is for code editing, not live polling. LAN access is blocked by default to prevent a misbehaving session from probing home-lab devices. An explicit `ALLOWED_CIDRS` array in `init-firewall.sh` provides a documented escape hatch for contributors who need to exercise pollers against real services.

### Volume-isolated `~/.claude`

The host `~/.claude` is bind-mounted **read-only** at `/home/dev/.claude-host`. The container manages its own writable `~/.claude` in a named Docker volume (`watchman-claude-<devcontainerId>`).

Rationale: a live bind-mount on `~/.claude` causes JSON corruption when host claude and container claude write simultaneously. The volume approach seeds the container once from the host (via `post-create.sh` rsync) and keeps subsequent sync explicit. `post-start.sh` runs an `rsync --update` pull from the read-only host mirror on every container start, so new agents/rules/MCP servers added on the host propagate automatically. The reverse direction (container → host) requires a manual `watchman-claude-sync push`.

### Keychain-backed authentication

The in-container browser OAuth flow has a known upstream bug (redirect URI double-encoded as `oauth%2Fcode/callback`). To avoid writing any long-lived credential to disk, the wrapper at `.devcontainer/bin/claude` retrieves the OAuth token from macOS Keychain (`service=watchman-claude-code-token`) at exec time and forwards it to the container via `devcontainer exec --remote-env CLAUDE_CODE_OAUTH_TOKEN=…`. The credential lives only in Keychain or in container process memory, never in a file.

### Host ssh-agent forwarding for commit signing

The host ssh-agent socket (`/run/host-services/ssh-auth.sock`) is bind-mounted into the container at `/ssh-agent`. The signing public key (`~/.ssh/github.pub`) is bind-mounted read-only at `/home/dev/.ssh/host-signing.pub`. The in-container `.gitconfig` includes the host gitconfig (carrying `user.name`, `user.email`, `commit.gpgsign`, `gpg.format`) and overrides `user.signingkey` to the container-local public key path. When `git commit -S` runs, `ssh-keygen` queries `SSH_AUTH_SOCK` for the matching private key — the private key never enters the container. `post-start.sh` runs a diagnostic that warns clearly if the signing key is not loaded in the host agent.

### Port forwarding bound to loopback

`runArgs` publishes ports 5173 (Vite dev), 3001 (Fastify backend), and 4173 (Vite preview) to `127.0.0.1` only. Other devices on the LAN cannot reach the dev server.

### Watchman-specific deltas from the Vision pattern

| Aspect | Vision | Watchman |
|---|---|---|
| Database | Postgres container | DuckDB embedded — no separate service |
| Runtime | bun | npm (workspaces) |
| Python tooling | Alembic migrations | None |
| Frontend port | 8080 | 5173 (Vite) |
| Backend port | 3002 | 3001 (Fastify) |
| LAN allowlist examples | yahoo-finance domains | None (Watchman LAN CIDRs) |
| Keychain service name | vision-claude-code-token | watchman-claude-code-token |

## Consequences

### Positive

- Claude CLI can run in `--dangerously-skip-permissions` mode without exposing the host filesystem, LAN, or credentials to unattended tool use.
- `~/.claude` corruption from concurrent host/container writes is eliminated.
- Credentials never touch disk; Keychain ACL provides an additional access-control layer.
- Commit signing works without the private key entering the container.
- Firewall apply is idempotent and re-runs on every container start, so a misconfigured container cannot "forget" its policy.
- Watchman repo edits appear on the host immediately (bind-mounted workspace).

### Negative

- Contributors need `@devcontainers/cli` installed globally and Docker Desktop (or equivalent) running.
- First-time setup requires one manual Keychain step (`security add-generic-password`) and one manual `gh auth login` inside the container.
- `watchman-claude-sync push` must be run manually to propagate container-side config changes back to the host.
- Electron desktop build (`npm run dist`) requires macOS native tools and must be run on the host, not inside the container.

### Risks

- **LAN polling blocked by default**: contributors testing live poller behavior must extend `ALLOWED_CIDRS`. This is intentional but can surprise first-time users.
- **Host Keychain dependency**: macOS-only. Linux contributors must fall back to env-var auth (`CLAUDE_CODE_OAUTH_TOKEN` exported in shell).
- **Docker Desktop ssh-agent socket**: Docker Desktop on macOS forwards `/run/host-services/ssh-auth.sock`; non-Desktop Docker (Lima, Colima, etc) uses a different socket path. The `post-start.sh` diagnostic helps detect but does not auto-resolve this.
- **Named volume orphan**: if the devcontainer is rebuilt with a new `devcontainerId`, the old `watchman-claude-<id>` volume is not automatically removed. Over time, orphaned volumes accumulate unless manually pruned with `docker volume prune`.

## Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| Docker-in-Docker | Significantly higher complexity; Claude would still have access to the DinD daemon socket, expanding the blast radius rather than reducing it. |
| Host-only with permission prompts | Interrupts unattended flows; defeats the purpose of `--dangerously-skip-permissions` mode. Does not address `~/.claude` corruption or LAN exposure. |
| Bind-mounting `~/.claude` directly | Causes JSON corruption when host claude and container claude write simultaneously. Observed in production on the Vision project. Rejected in favor of volume + explicit sync. |
| Env-var-only auth (no Keychain) | Token lands in `~/.config/fish/fish_variables` or shell history as plaintext. Acceptable fallback but not the recommended posture. |
| Allow all egress (no firewall) | Simpler but does not address LAN probing or credential exfiltration over the network. |

## References

- [[docs/guides/devcontainer|Devcontainer Setup Guide]] — contributor-facing setup instructions
- [[docs/adr/017-remove-authentication-frontend-v2-migration|ADR-017]] — single-user posture, no built-in auth
- [[docs/architecture/index|Architecture Overview]]
- `.devcontainer/Dockerfile`
- `.devcontainer/devcontainer.json`
- `.devcontainer/init-firewall.sh`
- `.devcontainer/post-create.sh`
- `.devcontainer/post-start.sh`
- `.devcontainer/bin/claude`
- `.devcontainer/README.md`

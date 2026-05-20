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

### Base image, user, and privilege model

`debian:bookworm-slim` (pinned by `@sha256` digest) with a `dev` user at UID 1000. The container runs with **`--security-opt=no-new-privileges`** and **`sudo` is not installed** — `dev` has no path to root at all. All privileged setup happens up-front in a **root `ENTRYPOINT`** (`/usr/local/sbin/watchman-entrypoint`, run via `containerUser=root`), which repairs volume/socket permissions, starts the egress proxy, and applies the firewall, then drops to a keep-alive PID 1. Interactive/`exec`/lifecycle sessions use `remoteUser=dev`.

> [!important] Why the entrypoint, not sudo
> `no-new-privileges` blocks setuid escalation, so `sudo` cannot gain root anyway. Rather than keep a neutered (and attack-surface) `sudo`, the privileged work moves to a root entrypoint that runs *before* any dev session. Image-baked scripts (`watchman-firewall`, `watchman-perms-fix`, `watchman-entrypoint`) live in `/usr/local/sbin` (root-owned, not writable from the container), so a rewrite of the repo copies cannot affect the running container — closing a root-escalation path.

### Egress: in-container SNI proxy + UID-locked firewall

Egress is enforced in two layers:

1. **`squid` (peek+splice) hostname allowlist.** squid peeks the TLS ClientHello SNI and, for allowed names, *splices* (tunnels without decrypting — end-to-end TLS is preserved, no MITM, no CA injection). Disallowed names are terminated. This is stronger than an IP allowlist: it can't be bypassed by an exfil endpoint co-hosted on an allowed CDN IP, and it defeats the `CONNECT`-host ≠ real-SNI domain-fronting trick (both verified in testing).
2. **`iptables` egress lock.** Outbound is allowed only for the `proxy` UID (squid). Every other process — dev sessions, a malicious npm postinstall — must use the proxy on `127.0.0.1:3128`; a direct connection is dropped because its socket UID isn't `proxy`. IPv6 is default-deny; a rate-limited LOG-then-DROP chain gives egress visibility (`dmesg | grep watchman-deny`). `NET_RAW` is dropped (only `NET_ADMIN` is granted).

Allowlist: Anthropic API + `claude.ai`, npm registry, GitHub, PyPI, Debian apt mirrors, nodejs.org, VS Code marketplace. `statsig`/`sentry` are intentionally excluded (covert-exfil surface, already suppressed by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`).

> [!note] Tools must honor `HTTPS_PROXY`
> `HTTPS_PROXY`/`HTTP_PROXY` are set in `containerEnv`. The `claude` CLI, `npm`, `git`, `gh`, and `pip` all honor it (verified). Node's **global `fetch` does not** — so app code making direct internet calls won't work inside the container. That's consistent with the LAN-block stance below: the devcontainer is for code editing; run the app on the host for live data/polling. LAN is also blocked (only the proxy's allowlisted hostnames are reachable).

> [!note] Hardening evolution
> The first iteration used an `iptables` IP-allowlist (resolve domains → `ipset`) plus a narrow `sudo` allowlist. Two follow-ups hardened it: (1) image-baked scripts + tightened sudoers (removed unrestricted `chown`/`chmod`), then (2) this proxy + `no-new-privileges` model, which removes `sudo` entirely and replaces IP-allowlisting with true hostname enforcement. Other additions: `@sha256` base-image pin, `--memory`/`--pids-limit` caps, `nosuid,nodev` tmpfs on `/tmp` + `noexec` on `/var/tmp`, ssh-agent socket tightened to `0600`, and a sanitized staged `~/.claude` bind (below).

### Volume-isolated `~/.claude`

The container manages its own writable `~/.claude` in a named Docker volume (`watchman-claude-<devcontainerId>`), seeded from a **sanitized staging copy** of the host config — never from a raw bind of `~/.claude`.

Rationale: a live bind of the full `~/.claude` both (a) corrupts JSON when host and container claude write simultaneously and (b) exposes everything in the host config dir to the container, including `.credentials.json`, MCP server tokens, and pasted secrets in history — the rsync `--exclude`s only apply at copy time, not to a raw bind. So the host wrapper (`bin/claude`) stages a sanitized copy into `~/.claude-watchman-stage` *before* `devcontainer up`: it drops secrets + volatile state and strips active code-exec config (`hooks`, `mcpServers`, `enabledPlugins`) so a compromised host config can't silently auto-run hooks/MCP servers/plugins inside the container. Only that staging dir is bind-mounted (read-only) at `/home/dev/.claude-stage`. `post-start.sh` does an `rsync --update` pull from the stage on every start; the reverse (container → host) is a manual `watchman-claude-sync push`.

### Keychain-backed authentication (Claude + gh)

The in-container browser OAuth flow has a known upstream bug (redirect URI double-encoded as `oauth%2Fcode/callback`). To avoid writing any long-lived credential to disk, the wrapper at `.devcontainer/bin/claude` retrieves tokens from the macOS Keychain at exec time and forwards them via `devcontainer exec --remote-env`: the Claude OAuth token (`service=watchman-claude-code-token`) and the GitHub token (`service=watchman-gh-token`, forwarded as `GH_TOKEN`/`GITHUB_TOKEN`). Neither token persists in a Docker volume or file — there is no `gh` config volume anymore; the credential lives only in Keychain or container process memory.

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
- First-time setup requires manual Keychain steps (`security add-generic-password` for the Claude token, and optionally `watchman-gh-token` for gh).
- `watchman-claude-sync push` must be run manually to propagate container-side config changes back to the host.
- App code that calls the internet via Node's global `fetch` won't work inside the container (proxy not honored by undici); run the app on the host for live data.
- Changing the egress allowlist or any baked script requires an image rebuild (the scripts and `squid.conf` are baked, not read from the workspace).
- Electron desktop build (`npm run dist`) requires macOS native tools and must be run on the host, not inside the container.

### Risks

- **LAN + Node-`fetch` egress blocked**: only the proxy's allowlisted hostnames are reachable, and Node's global `fetch` doesn't honor the proxy — so the app's own external/LAN calls don't work inside the container. Intentional (code editing, not live polling), but can surprise first-time users. Run the app on the host for live data.
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

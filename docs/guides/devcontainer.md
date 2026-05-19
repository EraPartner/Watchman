---
title: Devcontainer Guide
type: guide
status: active
date: 2026-05-19
tags: [guide, devcontainer, docker, claude, security, tooling, firewall, setup]
description: How to use the hardened Docker devcontainer for running Claude CLI in --dangerously-skip-permissions mode safely inside an isolated environment.
aliases: [devcontainer, docker devcontainer, claude devcontainer, skip-permissions setup, hardened container setup]
---

# Devcontainer Guide

> [!abstract] Overview
> The Watchman devcontainer is an **optional** hardened Docker environment for running the Claude CLI in `--dangerously-skip-permissions` mode. It is not required for normal development — use it when you want unattended agentic workflows without exposing your host OS, LAN, or credentials.
>
> See [[docs/adr/024-claude-code-devcontainer|ADR-024]] for the architectural rationale and threat model.

> [!warning] Scope
> This guide covers contributor tooling only. It does not affect the Watchman application itself — no API changes, no runtime behavior changes.

## What Runs Inside

| Component | Start command | Port (published to `127.0.0.1`) |
|---|---|---|
| Backend (Fastify + DuckDB embedded) | `npm run dev:backend` | `3001` |
| Frontend (Vite + React) | `npm run dev:frontend` | `5173` |
| Frontend preview (built bundle) | `npm run preview` | `4173` |
| GitHub CLI (`gh`) | pre-installed | — |
| Claude Code | devcontainer feature `claude-code:1.0` | — |

Base image: `debian:bookworm-slim`. Container user: `dev` (UID 1000, non-root). No Postgres, no Python — Watchman is a pure Node/TypeScript monorepo with DuckDB embedded.

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker Desktop (or compatible Docker runtime) | Must be running before you start |
| `@devcontainers/cli` | `npm install -g @devcontainers/cli` |
| macOS Keychain (recommended) | For credential storage; Linux contributors can use env-var fallback |
| Host ssh-agent with signing key loaded | For `git commit -S` to work inside the container |

## First-Time Setup

### Option A — VS Code or Cursor

1. Open the repo in VS Code or Cursor.
2. Install the **Dev Containers** extension (`ms-vscode-remote.remote-containers`).
3. Command Palette → **Dev Containers: Reopen in Container**.
4. Wait for `post-create.sh` to finish (`npm install` + config seeding).

### Option B — CLI only (no editor attachment)

1. Install the CLI: `npm install -g @devcontainers/cli`
2. Start the container (idempotent):
   ```sh
   devcontainer up --workspace-folder /path/to/Watchman
   ```
3. Drop into a shell:
   ```sh
   devcontainer exec --workspace-folder /path/to/Watchman bash
   ```
4. Or use the wrapper directly (see Host Shell Helpers below).

### One-time credential setup (macOS)

The devcontainer wrapper retrieves your Claude OAuth token from macOS Keychain so no credential ever lands in a plaintext file:

```sh
# 1) Generate a long-lived token (uses your existing Claude subscription)
claude setup-token
# → prints a token starting sk-ant-…  copy it

# 2) Store in Keychain under the service name the wrapper looks for
security add-generic-password \
  -s "watchman-claude-code-token" \
  -a "$USER" \
  -w   # prompts you to paste (won't echo)
```

The `watchman-claude` wrapper calls `security find-generic-password -s watchman-claude-code-token -w` on every invocation and forwards the result to the container via `--remote-env CLAUDE_CODE_OAUTH_TOKEN=…`.

**Linux / no-Keychain fallback**: export `CLAUDE_CODE_OAUTH_TOKEN` in your shell. The wrapper picks it up automatically. This is functional but stores the token in your shell config file as plaintext.

### One-time GitHub CLI auth (inside the container)

```sh
gh auth login --web --hostname github.com --git-protocol https
```

The token persists in the `watchman-ghconfig-<id>` named volume across container rebuilds.

### SSH signing key (host)

For `git commit -S` to work, the signing private key must be loaded in your host ssh-agent before launching the container:

```sh
# On the host, once per agent lifetime / login session
ssh-add ~/.ssh/github
```

If you use macOS Keychain ssh-agent, add to `~/.ssh/config` so the key auto-loads:

```
Host *
    UseKeychain yes
    AddKeysToAgent yes
```

`post-start.sh` prints a diagnostic if the expected signing key is absent from the forwarded agent.

## Host Shell Helpers

These fish functions are installed on the maintainer's machine. Document them here so other contributors can replicate the setup.

### `watchman-claude.fish`

Location: `~/.config/fish/functions/watchman-claude.fish`

Wraps `.devcontainer/bin/claude` — walks up from `$PWD` to find the project root, then calls the wrapper. Accepts all the same flags as `claude`:

```fish
function watchman-claude --description 'Run claude inside the Watchman devcontainer'
    set -l project ""
    set -l current $PWD
    while test "$current" != "/" -a "$current" != ""
        if test -f "$current/.devcontainer/devcontainer.json"
            set project $current; break
        end
        set current (dirname $current)
    end
    if test -z "$project"
        set project (set -q WATCHMAN_HOME; and echo $WATCHMAN_HOME; or echo "/path/to/Watchman")
    end
    if not test -x "$project/.devcontainer/bin/claude"
        echo "watchman-claude: wrapper missing at $project/.devcontainer/bin/claude" >&2
        return 1
    end
    WATCHMAN_PROJECT_ROOT=$project "$project/.devcontainer/bin/claude" $argv
end
```

### `watchman-claude-sync.fish`

Location: `~/.config/fish/functions/watchman-claude-sync.fish`

Syncs Claude config between host `~/.claude` and the container volume:

```sh
watchman-claude-sync pull     # refresh container from host (also auto-runs on container start)
watchman-claude-sync push     # propagate container changes back to host (manual; required)
watchman-claude-sync status   # show what differs
```

Both `pull` and `push` use `rsync --update` (per-file newer-wins) and a `jq` recursive merge for `.claude.json`. Files excluded from sync: `.credentials.json`, `backups/`, `cache/`, `paste-cache/`, `daemon.log`, `debug/`, `telemetry/`, `session-env/`, `shell-snapshots/`.

> [!info] Auto-pull on container start
> `post-start.sh` runs `rsync --update` from the read-only host bind-mount into the container volume on every container start. Host-side changes (new agents, edited rules, added MCP servers) propagate automatically. The reverse (container → host) requires an explicit `watchman-claude-sync push`.

### Shell abbreviation

`~/.config/fish/config.fish` has:

```fish
abbr watchman-claude "watchman-claude --dangerously-skip-permissions"
```

So typing `watchman-claude` at the prompt expands to include `--dangerously-skip-permissions` automatically.

## Network Policy

`init-firewall.sh` applies iptables default-deny egress on every container start.

**Allowed outbound traffic:**

| Category | Domains |
|---|---|
| Anthropic / Claude | `api.anthropic.com`, `console.anthropic.com`, `claude.ai`, `statsig.anthropic.com`, `sentry.io`, `code.claude.com`, `docs.claude.com` |
| npm | `registry.npmjs.org` |
| GitHub | `github.com`, `api.github.com`, `objects.githubusercontent.com`, `raw.githubusercontent.com`, `codeload.github.com`, `ghcr.io`, `pkg-containers.githubusercontent.com` |
| PyPI | `pypi.org`, `files.pythonhosted.org` |
| Debian apt | `deb.debian.org`, `security.debian.org` |
| Node.js | `nodejs.org` |
| VS Code | `marketplace.visualstudio.com`, `update.code.visualstudio.com` |

DNS is restricted to the resolver in `/etc/resolv.conf` only (prevents DNS tunneling).

Loopback (`127.0.0.1`) is fully allowed so backend and frontend can communicate inside the container.

**LAN is blocked by default.** Watchman polls home-lab LAN services at runtime, but the devcontainer is for code editing — not live polling. Claude should not reach your network devices during development.

To extend the allowlist to your LAN, edit `ALLOWED_CIDRS` in `.devcontainer/init-firewall.sh`:

```bash
ALLOWED_CIDRS=("192.168.1.0/24")   # your home LAN subnet
```

Then re-apply: `sudo .devcontainer/init-firewall.sh`

To add a public domain: edit `ALLOWED_DOMAINS` in the same file.

## Persistent Volumes

| Source | Container path | Type | Contents |
|---|---|---|---|
| `watchman-claude-<devcontainerId>` | `/home/dev/.claude` | named volume | Container's writable Claude config — seeded from host on first create, owned by container thereafter |
| `~/.claude` (host) | `/home/dev/.claude-host` | bind **read-only** | Source for sync operations; never written from the container |
| `~/.claude.json` (host) | `/home/dev/.claude-json-seed` | bind **read-only** | Seed for container's `~/.claude.json` on first create |
| Container filesystem | `/home/dev/.claude.json` | regular file | Container's writable global config |
| `watchman-ghconfig-<devcontainerId>` | `/home/dev/.config/gh` | named volume | `gh` auth token — persists across rebuilds |

The Watchman repo itself is bind-mounted at `/workspaces/Watchman` — edits appear on the host immediately.

> [!tip] Volume orphans
> If you delete and recreate the devcontainer, old `watchman-claude-<id>` and `watchman-ghconfig-<id>` volumes are not removed automatically. Clean up with `docker volume prune` when disk space is a concern.

## Container Permissions Model

| Layer | Detail |
|---|---|
| Container user | `dev` (UID 1000) — non-root |
| sudo allowlist | `iptables`, `iptables-restore`, `iptables-save`, `ip6tables`, `ipset`, `service`, `init-firewall.sh`, `chown`, `chmod` |
| No blanket root | `dev` cannot `sudo su` or run arbitrary root commands |
| Capabilities | `--cap-add=NET_ADMIN`, `--cap-add=NET_RAW` (required for iptables) |

## Environment Variables Set by the Devcontainer

| Variable | Value | Purpose |
|---|---|---|
| `DEVCONTAINER` | `true` | Signals code that it is running inside a devcontainer |
| `NODE_ENV` | `development` | Standard Node.js dev mode |
| `BACKEND_V2_HOST` | `0.0.0.0` | Backend binds all interfaces inside the container |
| `BACKEND_V2_PORT` | `3001` | Backend port |
| `VITE_FRONTEND_PORT` | `5173` | Vite dev server port |
| `VITE_PREVIEW_PORT` | `4173` | Vite preview server port |
| `SSH_AUTH_SOCK` | `/ssh-agent` | Forwarded host ssh-agent socket |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | `1` | Disables Claude telemetry / update checks that would fail behind the firewall |

## Git Operations Inside the Container

| Operation | Works | Notes |
|---|---|---|
| `git status` / `diff` / `log` | Yes | Bind-mounted repo |
| `git branch` / `switch` / `checkout` | Yes | Local refs only |
| `git commit -S` (SSH-signed) | Yes | Private key stays on host; signing goes through forwarded ssh-agent |
| `git push` over HTTPS | Yes, after `gh auth login` | `github.com` is allowlisted |
| `gh pr create`, `gh issue …` | Yes, after `gh auth login` | `gh` pre-installed |
| `git push` over SSH (`git@github.com`) | No | `~/.ssh` not mounted; use HTTPS via `gh` |

## Known Limitations

- **Electron desktop build (`npm run dist`)** requires macOS native tools; run on the host, not in this container.
- **Live LAN polling** is blocked by default. Add your LAN CIDR to `ALLOWED_CIDRS` in `init-firewall.sh` if you need the container's Watchman instance to reach real home-lab services.
- **Host Ollama via `host.docker.internal`** is blocked by the firewall by default; add to `ALLOWED_DOMAINS` in `init-firewall.sh` if needed.
- **Linux Keychain**: the macOS Keychain-backed auth path is not available. Export `CLAUDE_CODE_OAUTH_TOKEN` in your shell instead.
- **Docker Desktop ssh-agent socket path** (`/run/host-services/ssh-auth.sock`) is Docker Desktop-specific. Lima / Colima users need to adjust the socket path in `devcontainer.json` and `.devcontainer/post-start.sh`.

## Safety Note

> [!warning] Trust boundary
> The container runs as a non-root user, so the CLI accepts `--dangerously-skip-permissions`. Anthropic's warning still applies: a malicious project can exfiltrate anything *inside* the container, including the `~/.claude` credentials volume. Treat this as "host is isolated from Claude" — not "Claude is isolated from a hostile repo." Only enable for trusted repositories.

## Related

- [[docs/adr/024-claude-code-devcontainer|ADR-024]] — architectural rationale and threat model
- [[docs/guides/setup|Setup Guide]] — standard (host) development setup
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]] — how AI agents work on Watchman
- [[docs/guides/contributing|Contributing Guide]]
- [[docs/reference/environment-variables|Environment Variables]]

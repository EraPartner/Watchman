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
| Docker Desktop (or compatible Docker runtime) | Must be running before you start. The container requests `--memory=4g` — set the Docker Desktop VM to ≥4 GB or lower the limit in `devcontainer.json`. |
| `@devcontainers/cli` | `npm install -g @devcontainers/cli` |
| macOS Keychain (recommended) | For credential storage; Linux contributors can use env-var fallback |
| Host ssh-agent with signing key loaded | For `git commit -S` to work inside the container |
| `~/.gitconfig` and `~/.ssh/github.pub` must exist on the host | They're bind-mounted read-only; if either is missing, `devcontainer up` fails with an opaque mount error. Create them first (`touch ~/.gitconfig`; generate the signing key) or remove those mounts from `devcontainer.json`. |

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

### One-time GitHub auth (host Keychain)

The `gh`/git token is forwarded from the host Keychain at exec time (no token is stored in the container). On the **host**, once:

```sh
gh auth token | security add-generic-password -s watchman-gh-token -a "$USER" -w
# or paste a fine-grained PAT instead of `gh auth token`
```

The wrapper forwards it as `GH_TOKEN`/`GITHUB_TOKEN`, so `gh` and `git push` over HTTPS work with no `gh auth login` inside the container.

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

Egress is enforced in two layers, both applied by the root entrypoint on every start:

1. **In-container SNI proxy (`squid`, peek+splice).** All outbound HTTP(S) must go through `squid` on `127.0.0.1:3128`. squid peeks the TLS SNI and *splices* allowed hostnames (tunnels without decrypting — end-to-end TLS preserved, no MITM) and terminates the rest. This is hostname-enforced, so it can't be bypassed by an exfil endpoint sharing an allowed CDN's IP, and it defeats `CONNECT`-host ≠ SNI domain-fronting.
2. **`iptables` egress lock.** Only the `proxy` UID may originate outbound packets. Any process that bypasses the proxy and connects directly is dropped (its socket UID isn't `proxy`). IPv6 is default-deny; denied egress is rate-limited-logged (`dmesg | grep watchman-deny`).

**Allowed hostnames** (in `.devcontainer/squid.conf`): Anthropic API + `claude.ai` + Claude Code endpoints, `registry.npmjs.org`, GitHub (+ `*.githubusercontent.com`, `ghcr.io`), PyPI, Debian apt mirrors, `nodejs.org`, `*.visualstudio.com`, `malware-list.aikido.dev` (safe-chain). `statsig`/`sentry` are intentionally excluded; the cloud metadata IP `169.254.169.254` is explicitly denied.

> [!important] Tools must honor `HTTPS_PROXY`
> `HTTP(S)_PROXY` is set in `containerEnv`. `claude`, `npm`, `git`, `gh`, and `pip` honor it. Node's global `fetch` does **not** — so the Watchman backend's own outbound calls won't work inside the container. The devcontainer is for code editing; run the app on the host for live data. **LAN is also unreachable** (only the allowlisted hostnames resolve through the proxy).

To change the allowlist or proxy behavior, edit `.devcontainer/squid.conf` and **rebuild** (it's baked into the image). To re-apply the firewall manually: `sudo /usr/local/sbin/watchman-firewall` is no longer runnable by `dev` (no sudo) — restart the container instead. The proxy is supervised: if squid crashes, the entrypoint restarts it (egress stays denied while it's down — fail-closed).

### Supply-chain scanning (safe-chain)

`post-create` installs [Aikido safe-chain](https://github.com/AikidoSec/safe-chain) and `BASH_ENV` sources its wrappers into every bash session, so `npm`/`bun`/`pip`/`python` installs Claude runs mid-session are screened against the malware list at `malware-list.aikido.dev` before executing. The project's own pinned deps are installed plain (already vetted via the lockfile). This is defense-in-depth on top of the sandbox — a malicious package still couldn't escalate or exfiltrate (egress-locked, no host access, no-new-privileges).

### Observability: what's blocked and why

> [!note] Blocked egress looks like a TLS/connection error
> A blocked host surfaces as a TLS handshake / "self-signed certificate" error or a `CONNECT … 403` — that **is** the egress policy denying it (squid terminates disallowed SNIs). For the definitive record, read the egress audit log, which `dev` can read (it's group-`proxy` and `dev` is in that group):
> ```sh
> tail -f /var/log/squid/access.log   # TCP_TUNNEL = allowed, TCP_DENIED/NONE = blocked
> ```
> The `iptables` deny-log (`dmesg | grep watchman-deny`) catches direct-egress attempts that bypass the proxy, but `dmesg` needs root — the squid access log is the dev-readable audit path.

> [!note] Not covered by the proxy
> - **WebSearch / WebFetch** run Anthropic-side, not in the container — the squid allowlist doesn't constrain them. Fetched content only enters the container as text Claude writes; there's no direct exfil path, but the containment boundary stops at the container.
> - **TLS Encrypted Client Hello (ECH)**: peek+splice relies on a cleartext SNI. If a client uses ECH, squid sees no SNI and `ssl_bump terminate all` denies it (fail-closed) — correct, but it means ECH destinations are simply unreachable rather than allowlist-matched.

Run `.devcontainer/bin/doctor` inside the container for a one-shot readiness check (proxy up, egress allow/deny, tokens, audit log, config seeded).

## Persistent Volumes

| Source | Container path | Type | Contents |
|---|---|---|---|
| `watchman-claude-<devcontainerId>` | `/home/dev/.claude` | named volume | Container's writable Claude config — seeded from the sanitized stage on first create |
| `~/.claude-watchman-stage` (host) | `/home/dev/.claude-stage` | bind **read-only** | Sanitized staging copy the wrapper produces (secrets + `hooks`/`mcpServers`/`enabledPlugins` stripped). The raw host `~/.claude` is **never** bind-mounted. |
| Container filesystem | `/home/dev/.claude.json` | regular file | Container's writable global config (seeded from `…/claude.json` in the stage) |

The Watchman repo itself is bind-mounted at `/workspaces/Watchman` — edits appear on the host immediately. The `gh` token is **not** persisted to a volume; it's forwarded from the host Keychain (`watchman-gh-token`) at exec time.

> [!tip] Volume orphans
> If you delete and recreate the devcontainer, old `watchman-claude-<id>` volumes are not removed automatically. Clean up with `docker volume prune` when disk space is a concern.

## Container Permissions Model

| Layer | Detail |
|---|---|
| Session user | `dev` (UID 1000). `containerUser=root` runs the entrypoint; `remoteUser=dev` for all exec/lifecycle sessions. |
| no-new-privileges | `--security-opt=no-new-privileges` blocks all setuid escalation. **`sudo` is not installed** — `dev` has no path to root. |
| Privileged setup | Done once by the root `ENTRYPOINT` (`watchman-entrypoint`) before any dev session: perms repair → start proxy → apply firewall → drop to keep-alive. |
| Capabilities | `--cap-add=NET_ADMIN` only (for iptables). `NET_RAW` intentionally dropped — re-add to `runArgs` only if you need ICMP/raw sockets (e.g. Watchman's pingProber against an allowed LAN). |
| Resource limits | `--memory=8g`, `--memory-swap=8g`, `--pids-limit=4096` — caps blast radius of a runaway / malicious `npm install`. |
| tmpfs | `/tmp` (`nosuid,nodev`, 512 MB), `/var/tmp` (`noexec,nosuid,nodev`, 256 MB) — common dropper landing zones become non-persistent and partially non-executable. |
| Baked scripts | `watchman-entrypoint`, `watchman-firewall`, `watchman-perms-fix`, and `squid.conf` are `COPY`'d into the image (root-owned, not writable from the container). The repo copies are source-only and need a rebuild to take effect — an in-container rewrite (e.g. by Claude) can't affect the running container. |
| ssh-agent socket | `chmod 0600` + `chown dev:dev` (was world-writable `0666`), so only `dev` processes can drive the forwarded host agent. |
| IPv6 | Default-deny across all chains (the IPv4 path would otherwise be bypassable via `curl -6`). |

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
| `HTTP(S)_PROXY` / `http(s)_proxy` | `http://127.0.0.1:3128` | Routes all tool egress through the in-container SNI proxy |
| `NO_PROXY` / `no_proxy` | `localhost,127.0.0.1,::1` | Loopback bypasses the proxy |

## Git Operations Inside the Container

| Operation | Works | Notes |
|---|---|---|
| `git status` / `diff` / `log` | Yes | Bind-mounted repo |
| `git branch` / `switch` / `checkout` | Yes | Local refs only |
| `git commit -S` (SSH-signed) | Yes | Private key stays on host; signing goes through forwarded ssh-agent |
| `git push` over HTTPS | Yes | `GH_TOKEN` forwarded from Keychain (`watchman-gh-token`); `github.com` allowlisted |
| `gh pr create`, `gh issue …` | Yes | Uses the forwarded `GH_TOKEN`; no `gh auth login` needed |
| `git push` over SSH (`git@github.com`) | No | `~/.ssh` not mounted; use HTTPS |

## Known Limitations

- **App code using Node global `fetch`** won't reach the internet inside the container (undici doesn't honor `HTTPS_PROXY`). Run the app on the host for live data. `claude`/`npm`/`git`/`gh`/`pip` are unaffected.
- **Electron desktop build (`npm run dist`)** requires macOS native tools; run on the host.
- **Live LAN polling** is blocked — only the proxy's allowlisted hostnames resolve. The devcontainer is for code editing, not exercising pollers against home-lab devices.
- **Changing the egress allowlist** means editing `.devcontainer/squid.conf` and rebuilding (it's baked into the image).
- **Linux Keychain**: the macOS Keychain-backed auth path is not available. Export `CLAUDE_CODE_OAUTH_TOKEN`/`GH_TOKEN` in your shell instead.
- **Docker Desktop ssh-agent socket path** (`/run/host-services/ssh-auth.sock`) is Docker Desktop-specific. Lima / Colima users need to adjust it in `devcontainer.json`.

## Safety Note

> [!warning] Trust boundary
> The container runs as a non-root user, so the CLI accepts `--dangerously-skip-permissions`. Anthropic's warning still applies: a malicious project can exfiltrate anything *inside* the container, including the `~/.claude` credentials volume. Treat this as "host is isolated from Claude" — not "Claude is isolated from a hostile repo." Only enable for trusted repositories.

## Related

- [[docs/adr/024-claude-code-devcontainer|ADR-024]] — architectural rationale and threat model
- [[docs/guides/setup|Setup Guide]] — standard (host) development setup
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]] — how AI agents work on Watchman
- [[docs/guides/contributing|Contributing Guide]]
- [[docs/reference/environment-variables|Environment Variables]]

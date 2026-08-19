---
title: Devcontainer Guide
type: guide
status: active
date: 2026-08-19
tags:
  [
    guide,
    devcontainer,
    apple-container,
    claude,
    codex,
    security,
    tooling,
    firewall,
    setup,
  ]
description: How to use the hardened apple/container development sandbox with isolated Claude Code or OpenAI Codex state.
aliases:
  [
    devcontainer,
    apple container,
    claude devcontainer,
    codex devcontainer,
    skip-permissions setup,
    hardened container setup,
  ]
---

# Devcontainer Guide

> [!abstract] Overview
> The Watchman devcontainer is an **optional** hardened sandbox for running Claude Code or OpenAI Codex with provider-isolated state. It runs on **[apple/container](https://github.com/apple/container)** — Apple's native macOS container runtime — not Docker. It is not required for normal development — use it when you want agentic workflows without exposing your host OS, LAN, or credentials.
>
> See [[docs/adr/030-devcontainer-apple-container-runtime|ADR-030]] for the runtime decision, and [[docs/adr/024-claude-code-devcontainer|ADR-024]] for the original hardening rationale and threat model (Docker-era, superseded by ADR-030).

> [!warning] Scope
> This guide covers contributor tooling only. It does not affect the Watchman application itself — no API changes, no runtime behavior changes.

## What Runs Inside

| Component                           | Start command                                               | Port (published to `127.0.0.1`) |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| Backend (Fastify + DuckDB embedded) | `npm run dev:backend`                                       | `3001`                          |
| Frontend (Vite + React)             | `npm run dev:frontend`                                      | `5173`                          |
| Frontend preview (built bundle)     | `npm run preview`                                           | `4173`                          |
| GitHub CLI (`gh`)                   | pre-installed                                               | —                               |
| Node.js 24                          | pre-installed (static build)                                | —                               |
| Claude Code                         | `npm i -g @anthropic-ai/claude-code` (baked into the image) | —                               |
| OpenAI Codex CLI                    | `npm i -g @openai/codex` (baked and pinned)                 | —                               |
| Bubblewrap (`bwrap`)                | required by Codex and fingerprinted at build time           | —                               |
| Aikido safe-chain                   | baked at a reviewed version and fingerprinted               | —                               |

Base image: `debian:bookworm-slim` (pinned by `@sha256` digest). Container user: `dev` (UID 1000, non-root). No Postgres, no separate database — Watchman is a pure Node/TypeScript monorepo with DuckDB embedded.

## Prerequisites

| Requirement                                           | Notes                                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [apple/container](https://github.com/apple/container) | Apple's native macOS container runtime. Install it, then run `container system start` once before launching the sandbox. The launcher checks both and exits with a clear message if either is missing. |
| macOS (Apple Silicon)                                 | apple/container is macOS-native; there is no Linux/Windows path for this launcher.                                                                                                                     |
| macOS Keychain (recommended)                          | For Claude OAuth token storage; see [One-time credential setup](#one-time-credential-setup-macos).                                                                                                     |
| Codex account                                          | Codex performs device-code login inside its private container volume on first launch.                                                                                                                  |

> [!note] No Docker, no compose, no devcontainer CLI
> This sandbox does **not** use Docker, docker-compose, or the devcontainer CLI / Dev Containers VS Code extension. There is no `compose.yaml` and no `devcontainer.json` anywhere in the repo. Use `.devcontainer/bin/claude` (`watchman-claude`) or `.devcontainer/bin/codex` (`watchman-codex`).

## First-Time Setup

### One-time credential setup (macOS)

The launcher retrieves your Claude OAuth token from macOS Keychain so no credential ever lands in a plaintext file:

```sh
# 1) Generate a long-lived token (uses your existing Claude subscription)
claude setup-token
# → prints a token starting sk-ant-…  copy it

# 2) Store in Keychain under the service name the launcher looks for
security add-generic-password \
  -s "watchman-claude-code-token" \
  -a "$USER" \
  -w   # prompts you to paste (won't echo)
```

The `watchman-claude` launcher calls `security find-generic-password -s watchman-claude-code-token -w` on every invocation and forwards the result to the container via `container exec -e CLAUDE_CODE_OAUTH_TOKEN=…`.

**Linux / no-Keychain fallback**: not applicable — apple/container is macOS-only. (The launcher also accepts `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from your shell env, but storing a token in your shell config is plaintext at rest.)

Codex does not import host `~/.codex` state. Run `watchman-codex` and complete its
device-code login once; credentials persist only in the `watchman-codex` named
volume. The agent can read that container-local state, so use it only for this
trusted repository.

> [!note] No GitHub token, no ssh-agent inside the container
> Git inside the sandbox is **read-only**: the repo's `.git` is bind-mounted read-only, no `gh`/git token is forwarded, and the host ssh-agent is **not** forwarded. There is no `watchman-gh-token` to set up. Commit and push **from the host**, where your gitconfig, signing key, and gh auth live. See [Git Operations Inside the Container](#git-operations-inside-the-container).

### Launching the sandbox

```sh
watchman-claude --dangerously-skip-permissions
watchman-codex
```

On first run, the selected launcher builds the shared image, creates `watchman-dev`
or `watchman-codex`, runs `post-create.sh` once (safe-chain setup plus a scoped
root/backend/frontend `npm ci`), then
runs `post-start.sh` on every start. Claude state is seeded only for Claude; Codex
uses its private `~/.codex` volume. To open a shell, select the matching container:

```sh
container exec -it --user dev watchman-dev bash
container exec -it --user dev watchman-codex bash
```

To force a full rebuild (rebuild the image **and** recreate the container — e.g. after a Dockerfile or allowlist change):

```sh
WATCHMAN_REBUILD=1 watchman-claude --dangerously-skip-permissions
WATCHMAN_REBUILD=1 watchman-codex
```

By default the launcher powers the VM down on session exit (it stops pinning 4 GB). Set `WATCHMAN_STOP_ON_EXIT=0` to keep it warm for instant reuse across sessions.

## Host Shell Helpers

These fish functions are installed on the maintainer's machine. Document them here so other contributors can replicate the setup.

### `watchman-claude`

Location: `~/.config/fish/functions/watchman-claude.fish`

Wraps `.devcontainer/bin/claude` — walks up from `$PWD` to find the project root (matching `.devcontainer/Dockerfile`), falls back to `$WATCHMAN_HOME`, then calls the launcher. Accepts all the same flags as `claude`. A shell abbreviation expands `watchman-claude` to append `--dangerously-skip-permissions` automatically.

### `watchman-codex`

Wraps `.devcontainer/bin/codex`, selects the separate `watchman-codex` container
and credential volume, and forwards arguments to Codex. It shares the image,
network policy, workspace mount, and read-only Git boundary with Claude.

### `watchman-claude-sync`

Location: `~/.config/fish/functions/watchman-claude-sync.fish`

Syncs Claude config between host `~/.claude` and the container volume:

```sh
watchman-claude-sync pull     # refresh container from host (also auto-runs on container start)
watchman-claude-sync push     # propagate container changes back to host (also auto-runs on session exit)
watchman-claude-sync status   # show what differs
```

Both `pull` and `push` use `rsync --update` (per-file newer-wins) and a `jq` recursive merge for `.claude.json`. Files excluded from sync: `.credentials.json`, `backups/`, `cache/`, `paste-cache/`, `daemon.log`, `debug/`, `telemetry/`, `session-env/`, `shell-snapshots/`.

> [!info] Config sync is bidirectional and automatic
> `post-start.sh` runs `rsync --update` from the read-only host stage into the container volume on every container start, so host-side changes (new agents, edited rules, added MCP servers) propagate automatically. The reverse — container → host — **also runs automatically on session exit** (push-on-exit), so config Claude writes inside the box lands back on the host with no manual step. Disable per session with `WATCHMAN_AUTOSYNC=0`; `watchman-claude-sync push` remains the manual fallback (e.g. after a crash). Repo-level guidance (`AGENTS.md`), shared skills (`.agents/skills/`), and Claude compatibility adapters (`CLAUDE.md`, `.claude/skills/`) live in the mounted workspace and need no sync.

## Network Policy

Egress is enforced in two layers, both applied by the root entrypoint on every start:

1. **In-container SNI proxy (`squid`, peek+splice).** All outbound HTTP(S) must go through `squid` on `127.0.0.1:3128`. squid peeks the TLS SNI and _splices_ allowed **hostnames** (tunnels without decrypting — end-to-end TLS preserved, no MITM) and terminates the rest. Enforcement is by hostname, so it can't be bypassed by an exfil endpoint sharing an allowed CDN's IP, and it defeats `CONNECT`-host ≠ SNI domain-fronting.
2. **`iptables` egress lock (`init-firewall.sh`).** Default-deny, then only the `proxy` UID may originate outbound packets. Any process that bypasses the proxy and connects directly is dropped (its socket UID isn't `proxy`). IPv6 is default-deny; denied egress is rate-limited-logged (`dmesg | grep watchman-deny`).

> [!important] Hostname allowlist, not an IP allowlist
> The allowlist is a list of **hostnames** enforced via TLS SNI peek+splice — it is **not** an `iptables` IP-allowlist and it does **not** resolve N domains to IPs. The baked allowlist lives at `/etc/squid/allowlist.txt` and is generated by `LockBox/sync.sh` as the shared `base-allowlist.txt` plus Watchman's own `allowlist.extra.txt`.

**Allowed hostnames** (from `base-allowlist.txt` + `allowlist.extra.txt`): Anthropic API + Claude Code endpoints, `registry.npmjs.org`, GitHub (+ `*.githubusercontent.com`, `ghcr.io`), PyPI, Debian apt mirrors, `nodejs.org`, `malware-list.aikido.dev` (safe-chain), and similar build/tooling hosts. LAN hosts are intentionally absent.

> [!important] Everything routes through the proxy
> `HTTP(S)_PROXY` is set, and `NODE_USE_ENV_PROXY=1` makes Node ≥24's global `fetch` honor it too — so `claude`, `npm`, `git`, `gh`, `pip`, **and app code using `fetch`** all egress via squid. App calls to **allowlisted** hosts work inside the container. **LAN services remain unreachable** (they're not in the allowlist) — so Watchman's pollers still can't reach home-lab devices here; that's intentional. Add a LAN host to `allowlist.extra.txt` and rebuild only if you deliberately want to exercise a poller against it.

To change the allowlist or proxy behavior, edit `allowlist.extra.txt` (or the shared `base-allowlist.txt`), re-run `LockBox/sync.sh` to regenerate `.devcontainer/allowlist.txt`, and **rebuild** (`WATCHMAN_REBUILD=1 watchman-claude`) so it's re-baked into the image. `dev` can't re-run the firewall (no sudo) — a rebuild recreates the container and re-applies it. The proxy is supervised: if squid crashes, the entrypoint restarts it (egress stays denied while it's down — fail-closed).

### Supply-chain scanning (safe-chain)

[Aikido safe-chain](https://github.com/AikidoSec/safe-chain) is baked into the root-owned image at
a reviewed version. `post-create` fails closed if wrapper setup fails, and `BASH_ENV` sources the
wrappers into later bash sessions so agent-triggered `npm`/`pip` installs are screened against
`malware-list.aikido.dev`. The first-run npm install excludes the Electron workspace, verifies the
sole reviewed Roon Git dependency before temporarily allowing Git, and installs only the root,
backend, and frontend workspaces. This is defense-in-depth on top of the sandbox.

### Launch-integrity gate

The image bakes `watchman-verify-pins`, which records a SHA-256 of `node`, `npm`, `claude`, `codex`,
`bwrap`, `gh`, `git`, `python3`, and `safe-chain` at build time. The launcher runs it on every start
and **aborts fail-closed** on fingerprint drift, or if the checker is missing (a stale pre-pin
image). A legitimate tool upgrade changes these fingerprints — rebuild to re-pin
(`WATCHMAN_REBUILD=1 watchman-claude`).

### Observability: what's blocked and why

> [!note] Blocked egress looks like a TLS/connection error
> A blocked host surfaces as a TLS handshake / "self-signed certificate" error or a `CONNECT … 403` — that **is** the egress policy denying it (squid terminates disallowed SNIs). For the definitive record, read the egress audit log (the entrypoint keeps it world-readable so `dev` can inspect it without being in the `proxy` group; it's bounded by rotation past ~50 MB):
>
> ```sh
> tail -f /var/log/squid/access.log   # TCP_TUNNEL = allowed, TCP_DENIED/NONE = blocked
> ```
>
> The `iptables` deny-log (`dmesg | grep watchman-deny`) catches direct-egress attempts that bypass the proxy, but `dmesg` needs root — the squid access log is the dev-readable audit path.

> [!note] Not covered by the proxy
>
> - **WebSearch / WebFetch** run Anthropic-side, not in the container — the squid allowlist doesn't constrain them. Fetched content only enters the container as text Claude writes; there's no direct exfil path, but the containment boundary stops at the container.
> - **TLS Encrypted Client Hello (ECH)**: peek+splice relies on a cleartext SNI. If a client uses ECH, squid sees no SNI and terminates it (fail-closed) — correct, but it means ECH destinations are simply unreachable rather than allowlist-matched.

Run `bash .devcontainer/bin/doctor` inside the container for a one-shot readiness check (anti-tamper overlay live, proxy up, egress allow/deny, tokens, audit log, config seeded).

## Persistent Mounts and Volumes

| Source                                    | Container path                       | Type                | Contents                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `$PROJECT_ROOT` (host)                    | `/workspaces/Watchman`               | bind **read-write** | The Watchman repo — edits appear on the host immediately                                                                                                     |
| `$PROJECT_ROOT/.git` (host)               | `/workspaces/Watchman/.git`          | bind **read-only**  | Git history readable but immutable from inside                                                                                                               |
| `.devcontainer` (host)                    | `/workspaces/Watchman/.devcontainer` | bind **read-only**  | Anti-tamper overlay so the sandbox definition + host launcher can't be rewritten from inside                                                                 |
| `watchman-claude`                         | `/home/dev/.claude`                  | named volume        | Container's writable Claude config — seeded from the sanitized stage on first create                                                                         |
| `watchman-codex`                          | `/home/dev/.codex`                   | named volume        | Container-local Codex authentication and configuration; host `~/.codex` is never mounted                                                                      |
| `~/.claude-sandbox/stage/watchman` (host) | `/home/dev/.claude-stage`            | bind **read-only**  | Sanitized staging copy the launcher produces (secrets + `hooks`/`mcpServers`/`enabledPlugins` stripped). The raw host `~/.claude` is **never** bind-mounted. |
| Container filesystem                      | `/home/dev/.claude.json`             | regular file        | Container's writable global config (seeded from `…/claude.json` in the stage)                                                                                |

`watchman-claude` and `watchman-codex` are native apple/container named volumes.
The root entrypoint gives a fresh provider volume to `dev`. No `gh` token is
persisted or forwarded.

## Container Permissions Model

| Layer                   | Detail                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session user            | `dev` (UID 1000). The root `ENTRYPOINT` runs privileged setup; all `exec`/lifecycle sessions run as `--user dev`.                                                                                                                                                                                                                                             |
| No privilege escalation | **`sudo` is not installed** and **all setuid/setgid bits are stripped image-wide** — `dev` has no path to root. apple/container has **no `--security-opt`** mechanism, so there is no `no-new-privileges` flag; the **per-container VM boundary** is the isolation control instead.                                                                           |
| Privileged setup        | Done once by the root `ENTRYPOINT` (`watchman-entrypoint`) before any dev session: perms repair → apply firewall (fail-closed) → start proxy → drop to keep-alive PID 1.                                                                                                                                                                                      |
| Capabilities            | `--cap-drop ALL`, then re-add only: `NET_ADMIN` (iptables/ip6tables), `CHOWN`+`DAC_OVERRIDE`+`FOWNER` (perms-fix `chown -R`), `SETUID`+`SETGID` (squid dropping from root). Everything else is dropped.                                                                                                                                                       |
| Resource limits         | `-m 4g` (4 GB RAM), `-c 4` (4 CPUs), `--tmpfs /tmp`, `--tmpfs /var/tmp`. Bounds the blast radius of a runaway / malicious build.                                                                                                                                                                                                                              |
| Init                    | `--init` (reaps zombies and forwards SIGTERM to the entrypoint for graceful squid shutdown on `container stop`).                                                                                                                                                                                                                                              |
| Baked scripts           | `watchman-entrypoint`, `egress-firewall` (`init-firewall.sh`), `watchman-perms-fix`, `squid.conf`, and `allowlist.txt` are `COPY`'d into the image (root-owned, not writable from the container). The `.devcontainer` copies are source-only and need a rebuild to take effect — an in-container rewrite (e.g. by Claude) can't affect the running container. |
| IPv6                    | Default-deny across all chains (the IPv4 path would otherwise be bypassable via `curl -6`).                                                                                                                                                                                                                                                                   |

## Environment Variables Set by the Launcher

| Variable                                        | Value                                         | Purpose                                                                                              |
| ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DEVCONTAINER`                                  | `true`                                        | Signals code that it is running inside the sandbox                                                   |
| `NODE_ENV`                                      | `development`                                 | Standard Node.js dev mode                                                                            |
| `BACKEND_V2_HOST`                               | `0.0.0.0`                                     | Backend binds all interfaces inside the container                                                    |
| `BACKEND_V2_PORT`                               | `3001`                                        | Backend port                                                                                         |
| `VITE_FRONTEND_PORT`                            | `5173`                                        | Vite dev server port                                                                                 |
| `VITE_PREVIEW_PORT`                             | `4173`                                        | Vite preview server port                                                                             |
| `DISABLE_TELEMETRY` / `DISABLE_ERROR_REPORTING` | `1`                                           | Opt out of telemetry and error reporting to blocked endpoints                                      |
| `SANDBOX_AGENT`                                | `claude` or `codex`                           | Selects provider-specific post-create initialization                                                |
| `NODE_USE_ENV_PROXY`                            | `1`                                           | Makes Node ≥24 global `fetch` honor `HTTP(S)_PROXY` (so app `fetch` egresses via squid)              |
| `HTTP(S)_PROXY` / `http(s)_proxy`               | `http://127.0.0.1:3128`                       | Routes all tool egress through the in-container SNI proxy                                            |
| `NO_PROXY` / `no_proxy`                         | `localhost,127.0.0.1,::1`                     | Loopback bypasses the proxy                                                                          |
| `BASH_ENV`                                      | `/home/dev/.safe-chain/scripts/init-posix.sh` | Wires safe-chain into every bash session                                                             |

## Git Operations Inside the Container

Git inside the sandbox is **read-only**: `.git` is bind-mounted read-only, no `gh`/git token is forwarded, and the host ssh-agent is not forwarded.

| Operation                                   | Works    | Notes                                                                            |
| ------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `git status` / `diff` / `log` / `show`      | Yes      | Read-only on the bind-mounted repo (`safe.directory` set)                        |
| `git commit` / `rebase` / `reset` / `amend` | No       | `.git` is read-only — fails with EROFS, by design                                |
| `git push` / `gh pr create`                 | No       | No credential in the container; `git push` errors with "could not read Username" |
| commit signing (ssh-agent)                  | No (n/a) | No ssh-agent forwarded; commits happen on the host                               |

**Workflow:** make changes inside the container (they appear on the host via the bind mount immediately), then **commit and push from your host**.

## Known Limitations

- **Live LAN polling** is blocked — only the proxy's allowlisted hostnames resolve, and LAN hosts aren't in the allowlist. The devcontainer is for code editing, not exercising pollers against home-lab devices. (Node `fetch` _does_ route through the proxy via `NODE_USE_ENV_PROXY=1`, so app calls to allowlisted hosts work — LAN just isn't allowlisted.)
- **Electron desktop build (`npm run dist`)** requires macOS native tools; run on the host.
- **Electron dependencies are not installed in the agent container.** Run desktop packaging on the
  host after `npm run deps:ci`.
- **Changing the egress allowlist** means editing `allowlist.extra.txt`, re-running `LockBox/sync.sh`, and rebuilding (it's baked into the image).
- **macOS / apple-container only.** The Keychain-backed auth in `bin/claude` is macOS-specific, and apple/container is a macOS-native runtime — there is no Linux or Windows path for this launcher.
- **Reduced Linux capabilities.** The container drops all caps and re-adds only `NET_ADMIN, CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID` (what the entrypoint's iptables/perms/privilege-drops need). If you add tooling that needs another cap, add it to the launcher's `container run` args.

## Safety Note

> [!warning] Trust boundary
> The container runs as a non-root user and isolates each provider's credentials
> from the host and the other provider. A malicious project can still exfiltrate
> anything available _inside_ its selected container. Treat this as host isolation,
> not protection of the agent from a hostile repository. Use only trusted repositories.

## Related

- [[docs/adr/030-devcontainer-apple-container-runtime|ADR-030]] — apple/container runtime migration (supersedes the Docker approach in ADR-024)
- [[docs/adr/024-claude-code-devcontainer|ADR-024]] — original hardening rationale and threat model (Docker-era; superseded)
- [[docs/guides/setup|Setup Guide]] — standard (host) development setup
- [[docs/guides/ai-agent-workflow|AI Agent Workflow]] — how AI agents work on Watchman
- [[docs/guides/contributing|Contributing Guide]]
- [[docs/reference/environment-variables|Environment Variables]]

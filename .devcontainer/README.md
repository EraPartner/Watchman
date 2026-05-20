# Watchman devcontainer

Hardened dev environment for working on Watchman with the Claude CLI in
`--dangerously-skip-permissions` mode. The whole dev stack — backend and
frontend — runs natively inside this container; no Docker-in-Docker.

## What's inside

| Component | Where it runs | Port |
| --- | --- | --- |
| Backend (Node/Fastify + DuckDB embedded) | `npm run dev:backend` (tsx watch) | `3001` published to `127.0.0.1` |
| Frontend (Vite + React) | `npm run dev:frontend` | `5173` published to `127.0.0.1` |
| Frontend preview (built bundle) | `npm run preview` | `4173` published to `127.0.0.1` |
| GitHub CLI (`gh`) | apt | — |
| Claude Code | Installed via the official `claude-code` devcontainer feature | — |

The base image is plain `debian:bookworm-slim`. The container user is
`dev` (UID 1000). Watchman is a pure Node/TypeScript monorepo using
DuckDB embedded, so there's no separate database service to manage.

## How to use — CLI only

Prerequisite (one-time): `npm install -g @devcontainers/cli`.

A wrapper at `.devcontainer/bin/claude` forwards every invocation into
the container (idempotent `devcontainer up` + `devcontainer exec`).

**Fish function** (drop into `~/.config/fish/functions/watchman-claude.fish`):

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
        set project (set -q WATCHMAN_HOME; and echo $WATCHMAN_HOME; or echo "/Users/computer/Documents/Personal/Scripts/Projects/Watchman")
    end
    if not test -x "$project/.devcontainer/bin/claude"
        echo "watchman-claude: wrapper missing at $project/.devcontainer/bin/claude" >&2
        return 1
    end
    WATCHMAN_PROJECT_ROOT=$project "$project/.devcontainer/bin/claude" $argv
end
```

Then anywhere: `watchman-claude --dangerously-skip-permissions`. Works
from inside the repo (walk-up), from a subdir, and from unrelated dirs
(fallback to `$WATCHMAN_HOME`).

To drop into a shell instead of Claude:
```sh
devcontainer exec --workspace-folder /Users/computer/Documents/Personal/Scripts/Projects/Watchman bash
```

## Browser access from the host

`devcontainer.json:runArgs` publishes `5173`, `3001`, and `4173` to
`127.0.0.1`. Once Claude (or you) runs `npm run dev` inside the
container, the host can reach:

- `http://localhost:5173` — frontend (Vite dev)
- `http://localhost:4173` — frontend preview (built bundle)
- `http://localhost:3001/meta/health` — backend health endpoint

Bound to `127.0.0.1` only; other devices on your LAN can't see them.

## Network policy

Egress is enforced in two layers by the root entrypoint on every start:

1. **In-container SNI proxy** (`squid`, peek+splice). All outbound
   HTTP(S) must traverse `squid` on `127.0.0.1:3128`. squid peeks the
   TLS SNI and *splices* allowed hostnames (tunnels without decrypting —
   end-to-end TLS preserved, no MITM) and terminates the rest. Hostname
   enforcement can't be bypassed by an exfil endpoint sharing an allowed
   CDN IP, and it defeats `CONNECT`-host ≠ SNI domain-fronting.
2. **`iptables` egress lock**: only the `proxy` UID may originate
   outbound packets; everything else must use the proxy or be dropped.
   IPv6 is default-deny; denied egress is rate-limited-logged
   (`dmesg | grep watchman-deny`).

Allowlist (in `squid.conf`): Anthropic + `claude.ai` + Claude Code,
`registry.npmjs.org`, GitHub (+ `*.githubusercontent.com`, `ghcr.io`),
PyPI, Debian apt, `nodejs.org`, `*.visualstudio.com`.

> **Everything routes through the proxy.** `HTTP(S)_PROXY` is set, and
> `NODE_USE_ENV_PROXY=1` makes Node ≥24's global `fetch` honor it too —
> so `claude`, `npm`, `git`, `gh`, `pip`, and app `fetch` all egress via
> squid. App calls to **allowlisted** hosts work; **LAN stays unreachable**
> (not allowlisted), so pollers still can't hit home-lab devices here.

To change the allowlist, edit `squid.conf` and **rebuild** (it's baked
into the image). `dev` can't re-run the firewall (no sudo) — restart the
container to re-apply. squid is supervised by the entrypoint: if it
crashes, it's restarted (egress stays denied while down — fail-closed).

**Supply-chain scanning.** `post-create` installs Aikido safe-chain and
`BASH_ENV` wires it into every shell, so `npm`/`bun`/`pip` installs are
screened against `malware-list.aikido.dev` before running. Defense-in-depth
on top of the sandbox.

**Observability.** Blocked egress shows as a TLS/cert error or
`CONNECT 403` — that's the policy denying it. The definitive log is
`/var/log/squid/access.log` (`dev`-readable; `TCP_DENIED`/`NONE` = blocked).
`dmesg | grep watchman-deny` catches proxy-bypass attempts but needs root.
Run `.devcontainer/bin/doctor` for a one-shot readiness check.

**Not covered:** WebSearch/WebFetch run Anthropic-side, not through the
proxy. ECH (encrypted SNI) destinations fail closed (no SNI → terminated).

**Caps:** drops all Linux caps, re-adds only `NET_ADMIN, CHOWN,
DAC_OVERRIDE, FOWNER, SETUID, SETGID, SETPCAP` (entrypoint iptables/perms/
privilege-drops). Add to `runArgs` if new tooling needs more.

**Prereqs / portability:** Docker Desktop VM needs ≥4 GB. **macOS/Docker-Desktop
only** — the Keychain auth doesn't exist on Linux/Colima/OrbStack; export
`CLAUDE_CODE_OAUTH_TOKEN` there instead. No git credential or ssh-agent is
forwarded (see "Git" below), so `~/.ssh` and a `*-gh-token` are no longer needed.

## Persistence

| Source | Container path | Type | Holds |
| --- | --- | --- | --- |
| `.devcontainer` (host) | `/workspaces/Watchman/.devcontainer` | bind **RO** | Overlay on the rw workspace so the sandbox config + host launcher can't be rewritten from inside (see Safety note) |
| `watchman-claude-<id>` | `/home/dev/.claude` | named volume | Container's writable Claude config — seeded from the sanitized stage on first create |
| `~/.claude-watchman-stage` (host) | `/home/dev/.claude-stage` | bind **RO** | Sanitized staging copy the wrapper produces (secrets + `hooks`/`mcpServers`/`enabledPlugins` stripped). The raw host `~/.claude` is **never** mounted. |
| (container fs) | `/home/dev/.claude.json` | regular file | Container's writable global config, seeded from `…/claude.json` in the stage |

The Watchman repo is bind-mounted at `/workspaces/Watchman`, so edits
appear on the host immediately. The Claude config is **not** live-shared
(that corrupts `~/.claude.json` under concurrent writes, and a raw bind
would expose host secrets): the container gets its own writable copy
seeded from the sanitized stage, refreshed read-only on each start. No
`gh`/git token is forwarded at all — git inside the container is read-only
(see "Git").

## Syncing Claude config between host and container

A fish function `watchman-claude-sync` (drop in
`~/.config/fish/functions/watchman-claude-sync.fish`) can propagate
Claude config (settings, rules, plugins, agents, slash commands, hooks,
MCP server definitions, session history) between your host `~/.claude`
and the container's `~/.claude`. Use the Vision project's
`vision-claude-sync.fish` as a template; swap project name and
container-volume reference.

```sh
watchman-claude-sync pull     # refresh container from host (also auto-runs on launch)
watchman-claude-sync push     # propagate container changes back to host (also auto-runs on session exit)
watchman-claude-sync status   # show what differs
```

Both `pull` and `push` use `rsync --update` (per-file newer-wins) and a
`jq` recursive merge for `.claude.json` (container values win on key
conflict, so pulls add new host keys without clobbering container edits;
pushes overwrite host values with container's). No deletes — files
removed on one side stay on the other until manually cleaned up.

### Auto-pull on container start

The `watchman-claude` wrapper re-stages a sanitized copy of host
`~/.claude` into `~/.claude-watchman-stage` on every invocation, and
`post-start.sh` runs `rsync --update` from `/home/dev/.claude-stage` into
`/home/dev/.claude` on every container start. So host-side config changes
(new agents, edited rules) are picked up automatically. Note: `hooks`,
`mcpServers`, and `enabledPlugins` are stripped during staging — re-add
them inside the container if you want them active there.

Pull-on-start is safe under concurrency: it only reads from the stage, so
there's no write race against a host-side claude session.

### Push on session exit (automatic)

The reverse (container → host) now runs automatically. The `watchman-claude`
wrapper no longer `exec`s the session — it stays the parent process and, on
**session exit** (normal or Ctrl-C), runs `watchman-claude-sync push` against
the exact container it launched. So if Claude inside the container modifies its
own config — adds an agent, edits a rule, registers an MCP, writes a memory —
those changes land back on the host with no manual step. Pushing only after the
session ends keeps a single writer, so it can't race a live host-side claude on
`~/.claude.json`. Disable with `WATCHMAN_AUTOSYNC=0`; `watchman-claude-sync push`
remains the manual fallback.

**Files excluded from sync** (volatile runtime state, not portable):
`.credentials.json`, `backups/`, `cache/`, `paste-cache/`, `daemon.log`,
`debug/`, `telemetry/`, `session-env/`, `shell-snapshots/`.

## Auth — threat-model conscious version

Your host Claude credentials live in the macOS Keychain (encrypted,
ACL-protected, prompts on access). The in-container browser login is
broken upstream (redirect URI gets double-encoded as
`oauth%2Fcode/callback` and the OAuth provider rejects it). To avoid
writing any long-lived credential to a plaintext file on disk, we
store the container's token in Keychain too, and the wrapper retrieves
it at exec time and forwards it as an env var to the container —
credentials only ever land in Keychain or in container process memory,
never in a file.

**One-time setup, on the host:**

```sh
# 1) Generate a long-lived OAuth token (uses your existing subscription).
claude setup-token
# → prints a token starting with sk-ant-…   copy it

# 2) Store it in Keychain under a service name the wrapper looks for.
security add-generic-password \
  -s "watchman-claude-code-token" \
  -a "$USER" \
  -w   # prompts you to paste the token (won't echo)
```

That's it. The `watchman-claude` wrapper now does
`security find-generic-password -s watchman-claude-code-token -w` on
every invocation and forwards the result to the container via
`devcontainer exec --remote-env CLAUDE_CODE_OAUTH_TOKEN=…`. No plaintext
file, no fish universal var, no `.credentials.json` in `~/.claude`.

**The Keychain "Always Allow" decision.** The first time `security`
reads this entry, macOS will pop the standard Keychain prompt. Your
choices:

- **Allow** → token released to this invocation only; you'll see the
  prompt again next time. Highest friction, lowest risk: any other
  process trying to grab the token has to either trigger a visible
  prompt or impersonate `security` plausibly enough to fool you.
- **Always Allow** → grants the `security` binary blanket access. No
  more prompts, but any process running as your user can shell out to
  `security` and get the token without you noticing. Convenience at the
  cost of one of the layers Keychain was buying you.

For a host-compromise threat model, **Allow each time is the more
defensible choice.** If you later get tired of clicking, change your
mind via Keychain Access.app → find the entry → Access Control → swap.

**Rotating.** When you want to invalidate the token:

```sh
security delete-generic-password -s "watchman-claude-code-token"
# then re-run the two-step setup above with a fresh `claude setup-token`
```

**Fallback paths (still supported by the wrapper).** If you'd rather
skip the Keychain dance, the wrapper also picks up
`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `ANTHROPIC_AUTH_TOKEN`
straight from your shell env. Worse posture (plaintext in
`~/.config/fish/fish_variables`), but functional.

## Git (read-only inside; commit & push on the host)

The container can **read** git history but cannot change it. The repo's `.git`
is bind-mounted **read-only**, no git credential (`GH_TOKEN`/`GITHUB_TOKEN`) is
forwarded, and the host ssh-agent is **not** forwarded. So a compromised agent
can't rewrite history, push, or sign/authenticate as you over SSH.

| Operation | Works? | Notes |
| --- | --- | --- |
| `git status` / `diff` / `log` / `show` | ✅ | Read-only on the bind-mounted repo (`safe.directory` is set) |
| `git commit` / `rebase` / `reset` / `amend` | ❌ | `.git` is read-only — fails with EROFS, by design |
| `git push` / `gh pr create` | ❌ | No credential in the container; `git push` errors with "could not read Username" |
| commit signing (ssh-agent) | ❌ (n/a) | No ssh-agent forwarded; nothing to sign with — commits happen on the host |

**Workflow:** make changes inside the container (they appear on the host via the
bind mount immediately), then **commit and push from your host** where your
gitconfig, signing key, and gh auth live. There is no in-container git auth to
set up.

so the key auto-loads on first use and survives reboots.

## Known limitations

- **Electron desktop build (`npm run dist`)** — needs macOS native tools;
  run on the host, not in this container.
- **Live LAN polling** — unreachable; only the proxy's allowlisted
  hostnames resolve, and LAN hosts aren't allowlisted. App `fetch` *does*
  route through the proxy (`NODE_USE_ENV_PROXY=1`), so calls to allowlisted
  hosts work — LAN just isn't one of them. The devcontainer is for code editing.
- **Changing the egress allowlist** — edit `squid.conf` and rebuild
  (it's baked into the image, not read from the workspace).
- **Host Ollama via `host.docker.internal`** — blocked; add it to the
  `squid.conf` allowlist and rebuild if you want it through.

## Safety note

The container runs as a non-root user (`dev`), so the CLI accepts
`--dangerously-skip-permissions`. Anthropic still warns: a malicious
project can exfiltrate anything inside the container, including the
`~/.claude` credentials volume. Treat this as *"host is isolated from
Claude,"* not *"Claude is isolated from a hostile repo."* Only enable
for trusted repositories.

**Why `.devcontainer` is mounted read-only.** The repo is bind-mounted
read-write at `/workspaces/Watchman` so the agent can edit source — but that
same mount would otherwise expose the sandbox's own definition
(`devcontainer.json` `runArgs`, `Dockerfile`) and the **host-side launcher**
(`bin/claude`, `bin/doctor`), which run on your **Mac** with your shell and
Keychain. A compromised in-container agent could add `--privileged` /
`-v /:/host` / a `docker.sock` mount to `runArgs`, or just edit `bin/claude`,
and the next `claude` invocation (which calls `devcontainer up` and re-execs
the launcher) would run it on the host — a trivial full escape. To close that,
`.devcontainer` is re-mounted **read-only on top of** the read-write workspace,
so it is immutable from inside. The container cannot lift this: it has
`cap-drop=ALL` (no `CAP_SYS_ADMIN`, so no remount/unmount), `no-new-privileges`,
and `.devcontainer` is a busy mountpoint that can't be replaced — the protection
re-applies on every `devcontainer up`. **Edit `.devcontainer` on the host only,**
then rebuild.

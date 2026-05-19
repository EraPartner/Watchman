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

`init-firewall.sh` applies an iptables default-deny egress policy on
every container start. Allowlist covers Anthropic, npm, GitHub, PyPI,
Debian apt mirrors, and nodejs.org. DNS is restricted to the resolver
configured in `/etc/resolv.conf` to narrow the DNS-tunneling surface
called out in
[anthropics/claude-code#36907](https://github.com/anthropics/claude-code/issues/36907).

**LAN access is blocked by default.** Watchman's runtime polls
home-lab services on your LAN (Bitcoin node, IPFS, qBittorrent, Tor,
AdGuard, Synology, etc), but the devcontainer treats Claude as a
code-editor that shouldn't be probing your network. If you want to
exercise the pollers against real services from inside the container,
edit `ALLOWED_CIDRS` in `init-firewall.sh`:

```bash
ALLOWED_CIDRS=("192.168.1.0/24")   # your LAN
```

Then re-run `sudo .devcontainer/init-firewall.sh`.

To add another public domain, edit `ALLOWED_DOMAINS` in the same file.

## Persistence

| Source | Container path | Type | Holds |
| --- | --- | --- | --- |
| `watchman-claude-<id>` | `/home/dev/.claude` | named volume | Container's writable Claude config — seeded from host on first create, owned by container thereafter |
| `~/.claude` (host) | `/home/dev/.claude-host` | bind **RO** | Read-only mirror of host's Claude config — used as the source for sync operations |
| `~/.claude.json` (host) | `/home/dev/.claude-json-seed` | bind **RO** | Read-only seed for the container's `~/.claude.json` |
| (container fs) | `/home/dev/.claude.json` | regular file | Container's writable global config, seeded from `.claude-json-seed` on first create |
| `watchman-ghconfig-<id>` | `~/.config/gh` | named volume | `gh` auth token |

The Watchman repo itself is bind-mounted at `/workspaces/Watchman`, so
file edits appear on the host immediately. The Claude config, however,
is **not** live-shared — that previously corrupted `~/.claude.json` when
host claude and container claude were running simultaneously. Instead,
the container has its own writable copy seeded from the host once, plus
a read-only mirror of the host config kept around for explicit sync
operations.

## Syncing Claude config between host and container

A fish function `watchman-claude-sync` (drop in
`~/.config/fish/functions/watchman-claude-sync.fish`) can propagate
Claude config (settings, rules, plugins, agents, slash commands, hooks,
MCP server definitions, session history) between your host `~/.claude`
and the container's `~/.claude`. Use the Vision project's
`vision-claude-sync.fish` as a template; swap project name and
container-volume reference.

```sh
watchman-claude-sync pull     # refresh container from host (also auto-runs on container start)
watchman-claude-sync push     # propagate container changes back to host (manual; required)
watchman-claude-sync status   # show what differs
```

Both `pull` and `push` use `rsync --update` (per-file newer-wins) and a
`jq` recursive merge for `.claude.json` (container values win on key
conflict, so pulls add new host keys without clobbering container edits;
pushes overwrite host values with container's). No deletes — files
removed on one side stay on the other until manually cleaned up.

### Auto-pull on container start

`post-start.sh` runs `rsync --update` from `/home/dev/.claude-host` into
`/home/dev/.claude` on every container start, including the implicit
`devcontainer up` that the `watchman-claude` wrapper does on each
invocation. So host-side config changes (new agents, edited rules,
added MCP servers) are picked up automatically without you running
anything.

Pull-on-start is safe under concurrency: it only reads from host, so
there's no write race against a host-side claude session.

### Push remains explicit

The reverse (container → host) is **not** automatic. If Claude inside
the container modifies its own config — adds an agent, edits a rule,
registers an MCP — those changes live only in the container volume
until you run `watchman-claude-sync push`.

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

## Git, GitHub, signed commits

| Operation | Works? | Notes |
| --- | --- | --- |
| `git status` / `diff` / `log` | ✅ | Read-only on the bind-mounted repo |
| `git branch` / `switch` / `checkout` | ✅ | Local refs only |
| `git commit -S` (SSH-signed) | ✅ | Public key bind-mounted from host; private key never enters the container — signing goes through the forwarded ssh-agent (`/run/host-services/ssh-auth.sock`). Make sure your agent is unlocked on the host. |
| `git push` over HTTPS | ✅ after `gh auth login` | `github.com` is allowlisted; `gh` manages the git credential helper |
| `gh pr create`, `gh issue …` | ✅ after `gh auth login` | `gh` preinstalled |
| `git push` / `git@github.com` (SSH transport) | ❌ by default | `~/.ssh` is not mounted; ssh-agent socket is the only key channel. Use HTTPS push via `gh`. |

**One-time auth inside the container:**

```sh
gh auth login --web --hostname github.com --git-protocol https
```

The token persists in the `watchman-ghconfig-<id>` volume across rebuilds.

**How signing works here.** Your host `~/.gitconfig` is bind-mounted
read-only at `~/.gitconfig-host` and included from an in-container
`~/.gitconfig`, so `user.name`, `user.email`, `commit.gpgsign`, and
`gpg.format = ssh` all carry over. The override sets `user.signingkey`
to the in-container path of the bind-mounted public key. When
`git commit -S` runs, ssh-keygen queries `SSH_AUTH_SOCK` (= `/ssh-agent`,
the forwarded host ssh-agent socket) for a private key matching the
public key — it never sees the private key file directly.

**Prerequisite on your host:** the signing private key must actually be
loaded in your host ssh-agent before you `watchman-claude`. If it isn't,
`post-start.sh` prints a diagnostic showing the expected fingerprint vs.
what's in the agent, with the exact `ssh-add` command to fix it.

```sh
# on the host, once per agent lifetime / login session
ssh-add ~/.ssh/github
```

If you use macOS Keychain ssh-agent, add to `~/.ssh/config`:

```
Host *
    UseKeychain yes
    AddKeysToAgent yes
```

so the key auto-loads on first use and survives reboots.

## Known limitations

- **Electron desktop build (`npm run dist`)** — needs macOS native tools;
  run on the host, not in this container.
- **Live LAN polling** — blocked by default (see Network policy above).
  Add your LAN CIDR to `ALLOWED_CIDRS` in `init-firewall.sh` if you want
  Watchman inside the container to actually reach your home-lab services.
- **Host Ollama via `host.docker.internal`** — Docker Desktop supports
  it but the firewall drops it by default; add to `ALLOWED_DOMAINS` in
  `init-firewall.sh` if you want it through.

## Safety note

The container runs as a non-root user (`dev`), so the CLI accepts
`--dangerously-skip-permissions`. Anthropic still warns: a malicious
project can exfiltrate anything inside the container, including the
`~/.claude` credentials volume. Treat this as *"host is isolated from
Claude,"* not *"Claude is isolated from a hostile repo."* Only enable
for trusted repositories.

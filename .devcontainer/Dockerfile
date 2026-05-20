# Watchman devcontainer — runs the full dev stack (backend + frontend) natively
# inside the container, so we don't need Docker-in-Docker.
#
# Hardened for Claude CLI in --dangerously-skip-permissions mode:
#   - runs with --security-opt=no-new-privileges (no sudo, no setuid escalation)
#   - a root ENTRYPOINT does all privileged setup, then drops to a keep-alive;
#     dev sessions (remoteUser=dev) never have a path to root
#   - all egress is forced through an in-container squid proxy that enforces a
#     HOSTNAME allowlist (peek+splice SNI, no TLS interception)
#
# Tools installed by features (devcontainer.json): node, claude-code.
# Watchman is a pure Node/TypeScript monorepo (npm workspaces) using DuckDB
# embedded — no Postgres/Python required.

# Pin the base image by digest for reproducibility + supply-chain integrity.
# Bump deliberately (re-pin) to pick up base security updates.
FROM debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb

ARG TZ=UTC
ENV TZ="$TZ"
ENV DEBIAN_FRONTEND=noninteractive

# Base utilities + a non-root `dev` user (UID 1000) so the bind-mounted
# workspace ownership lines up with the host user. NOTE: sudo is intentionally
# NOT installed — the container runs with no-new-privileges (sudo couldn't gain
# root anyway) and all privileged setup happens in the root ENTRYPOINT.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release \
      git less procps jq locales openssh-client unzip rsync \
      iptables dnsutils openssl \
      squid-openssl \
      build-essential pkg-config \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 1000 --shell /bin/bash dev \
  && echo "C.UTF-8 UTF-8" > /etc/locale.gen && locale-gen

# GitHub CLI from the official cli.github.com apt repo.
RUN install -d -m 0755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

# Bake privileged scripts into the image at /usr/local/sbin (root-owned, not
# writable from inside the container). The repo copies under .devcontainer/
# are source-only — a rewrite there cannot affect the running container, which
# closes an escalation path (rewrite workspace script -> trigger root re-apply).
COPY init-firewall.sh /usr/local/sbin/watchman-firewall
COPY perms-fix.sh     /usr/local/sbin/watchman-perms-fix
COPY entrypoint.sh    /usr/local/sbin/watchman-entrypoint
COPY squid.conf       /etc/squid/squid.conf
COPY allowlist.txt    /etc/squid/allowlist.txt
RUN chmod 0755 /usr/local/sbin/watchman-firewall /usr/local/sbin/watchman-perms-fix /usr/local/sbin/watchman-entrypoint \
  && chown root:root /usr/local/sbin/watchman-firewall /usr/local/sbin/watchman-perms-fix /usr/local/sbin/watchman-entrypoint

# Pre-build the squid TLS-bump cert + cert DB so first start is fast. The
# entrypoint regenerates either if missing (e.g. tmpfs). The key (and the .pem
# that contains it) are 0600 — squid reads them at startup as root, so dev never
# needs to. (This bump CA is in no trust store and allowed traffic is spliced,
# so it can't MITM anything, but a private key shouldn't be world-readable.)
RUN mkdir -p /etc/squid/certs /var/lib/squid /var/log/squid /var/spool/squid \
  && openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
       -subj "/CN=watchman-egress-proxy" \
       -keyout /etc/squid/certs/bump.key -out /etc/squid/certs/bump.crt \
  && cat /etc/squid/certs/bump.key /etc/squid/certs/bump.crt > /etc/squid/certs/bump.pem \
  && chmod 600 /etc/squid/certs/bump.key /etc/squid/certs/bump.pem \
  && /usr/lib/squid/security_file_certgen -c -s /var/lib/squid/ssl_db -M 4MB \
  && chown -R proxy:proxy /etc/squid/certs /var/lib/squid /var/log/squid /var/spool/squid

# NOTE: we deliberately do NOT write an apt proxy config. devcontainer
# features (node, claude-code) run their own apt installs in a later build
# stage that inherits this filesystem; an apt proxy pointing at squid (which
# only runs at container runtime) would make those feature builds fail to
# fetch packages. Runtime apt isn't needed anyway (dev has no sudo under
# no-new-privileges). If you ever need runtime apt, route it through the proxy
# explicitly: apt-get -o Acquire::http::Proxy=http://127.0.0.1:3128 ...

# Pre-create ~/.ssh with strict perms so the signing-key bind-mount lands
# in a dev-owned dir (ssh-keygen rejects loose perms on .ssh).
RUN install -d -o dev -g dev -m 0700 /home/dev/.ssh

# Pre-create dirs backed by named volumes so a fresh volume inherits dev
# ownership on first mount (the entrypoint's perms-fix is the runtime backstop).
RUN install -d -o dev -g dev -m 0700 /home/dev/.claude \
 && install -d -o dev -g dev -m 0755 /home/dev/.config /home/dev/.config/gh

# Strip ALL setuid/setgid bits image-wide. Inert under no-new-privileges, but
# clean defense-in-depth — and a generic find won't go stale like a hand-list
# (it also catches ssh-keysign, unix_chkpwd, squid/pinger). NOTE: we use
# `runuser` (not setuid) for privilege drops, the forwarded host ssh-agent for
# signing, and squid's pinger is unused (no cache peers), so nothing here needs
# elevated bits.
RUN find / -xdev -type f -perm /6000 -exec chmod -s {} + 2>/dev/null || true

# Container process (PID 1 / entrypoint) runs as root so it can apply iptables
# and start the proxy; devcontainer.json sets remoteUser=dev for sessions and
# --security-opt=no-new-privileges so dev cannot escalate.
WORKDIR /workspaces/Watchman

# Health: the egress proxy must be running AND the firewall must still be
# enforcing default-deny (the firewall apply is best-effort/non-fatal, so this
# turns a silent fail-open into a visible `unhealthy`). Uses pgrep, not a socket
# connect, so it doesn't spam the squid access log with empty-probe errors.
# start-period covers entrypoint setup; `.devcontainer/bin/doctor` is fuller.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD bash -c 'pgrep -x squid >/dev/null && /usr/sbin/iptables -S OUTPUT 2>/dev/null | grep -q "^-P OUTPUT DROP"'

ENTRYPOINT ["/usr/local/sbin/watchman-entrypoint"]

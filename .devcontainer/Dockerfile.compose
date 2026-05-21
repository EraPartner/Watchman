# Watchman sandbox image — devcontainer-FREE (built by docker compose).
#
# This is the self-contained twin of ./Dockerfile. The devcontainer build relied
# on devcontainer FEATURES (node:1, anthropics/claude-code:1.0) layered on top of
# Dockerfile by the devcontainer CLI; compose has no feature system, so this file
# installs Node + the Claude CLI itself. Everything else (hardening, egress
# proxy, baked privileged scripts) is identical to Dockerfile.
#
# Hardened for Claude CLI in --dangerously-skip-permissions mode:
#   - runs with --security-opt=no-new-privileges (no sudo, no setuid escalation)
#   - a root ENTRYPOINT does all privileged setup, then drops to a keep-alive
#   - all egress is forced through an in-container squid proxy enforcing a
#     HOSTNAME allowlist (peek+splice SNI, no TLS interception)

# Pin the base image by digest for reproducibility + supply-chain integrity.
FROM debian:bookworm-slim@sha256:0104b334637a5f19aa9c983a91b54c89887c0984081f2068983107a6f6c21eeb

ARG TZ=UTC
ENV TZ="$TZ"
ENV DEBIAN_FRONTEND=noninteractive

# Base utilities + a non-root `dev` user (UID 1000). sudo intentionally absent.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release xz-utils \
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

# --- Node.js (replaces the devcontainer `node:1` feature) --------------------
# The feature installed Node 24 via nvm under /usr/local/share/nvm; we install
# the same version it resolved (24.15.0) from the official static build into
# /usr/local, plus a dev-OWNED global npm prefix so the `dev` user can still
# `npm i -g` at runtime (safe-chain in post-create) — the equivalent of the
# feature's group-writable nvm dir. Bump NODE_VERSION deliberately to update.
ARG NODE_VERSION=24.15.0
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in amd64) na=x64 ;; arm64) na=arm64 ;; *) echo "unsupported arch $arch" >&2; exit 1 ;; esac; \
    curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz"; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
      --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' --exclude='*/README.md'; \
    rm /tmp/node.tar.xz; \
    mkdir -p /usr/local/share/npm-global; \
    node --version; npm --version
# Global npm prefix -> a dev-owned dir so runtime `npm i -g` (safe-chain in
# post-create) works without root. Use the ENV var, NOT /etc/npmrc: npm's real
# "global" config is $PREFIX/etc/npmrc (/usr/local/etc/npmrc), so a plain
# /etc/npmrc is ignored and globals would land in root-owned /usr/local/lib.
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=/usr/local/share/npm-global/bin:/usr/local/bin:$PATH
# Login shells (bash -l) reset PATH via /etc/profile, dropping the ENV above;
# re-add the tool dirs so node/npm/claude/safe-chain resolve in login shells too.
RUN printf 'export PATH="/usr/local/share/npm-global/bin:/usr/local/bin:$PATH"\n' \
      > /etc/profile.d/00-npm-global.sh

# --- Claude Code CLI (replaces the `anthropics/claude-code:1.0` feature) -----
# Installed to the global prefix as root at build; the prefix is chown'd to dev
# AFTERWARD so the build-time files end up dev-owned and runtime `npm i -g`
# (safe-chain in post-create) can write the same prefix without EACCES.
RUN npm install -g @anthropic-ai/claude-code \
  && claude --version \
  && chown -R dev:dev /usr/local/share/npm-global

# Bake privileged scripts into the image at /usr/local/sbin (root-owned, not
# writable from inside the container). The .devcontainer copies are source-only.
COPY init-firewall.sh /usr/local/sbin/egress-firewall
COPY perms-fix.sh     /usr/local/sbin/watchman-perms-fix
COPY entrypoint.sh    /usr/local/sbin/watchman-entrypoint
COPY squid.conf       /etc/squid/squid.conf
COPY allowlist.txt    /etc/squid/allowlist.txt
RUN chmod 0755 /usr/local/sbin/egress-firewall /usr/local/sbin/watchman-perms-fix /usr/local/sbin/watchman-entrypoint \
  && chown root:root /usr/local/sbin/egress-firewall /usr/local/sbin/watchman-perms-fix /usr/local/sbin/watchman-entrypoint

# Inbound ports this project publishes (read by egress-firewall for INPUT ACCEPT).
RUN mkdir -p /etc/egress && printf '5173\n3001\n4173\n' > /etc/egress/inbound-ports

# Pre-build the squid TLS-bump cert + cert DB so first start is fast.
RUN mkdir -p /etc/squid/certs /var/lib/squid /var/log/squid /var/spool/squid \
  && openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
       -subj "/CN=watchman-egress-proxy" \
       -keyout /etc/squid/certs/bump.key -out /etc/squid/certs/bump.crt \
  && cat /etc/squid/certs/bump.key /etc/squid/certs/bump.crt > /etc/squid/certs/bump.pem \
  && chmod 600 /etc/squid/certs/bump.key /etc/squid/certs/bump.pem \
  && /usr/lib/squid/security_file_certgen -c -s /var/lib/squid/ssl_db -M 4MB \
  && chown -R proxy:proxy /etc/squid/certs /var/lib/squid /var/log/squid /var/spool/squid

# Pre-create dirs backed by named volumes so a fresh volume inherits dev ownership.
RUN install -d -o dev -g dev -m 0700 /home/dev/.claude \
 && install -d -o dev -g dev -m 0755 /home/dev/.config /home/dev/.config/gh

# Strip ALL setuid/setgid bits image-wide (defense-in-depth; inert under
# no-new-privileges, but a generic find won't go stale like a hand-list).
RUN find / -xdev -type f -perm /6000 -exec chmod -s {} + 2>/dev/null || true

WORKDIR /workspaces/Watchman

# Health: proxy running AND firewall still default-deny.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD bash -c 'pgrep -x squid >/dev/null && /usr/sbin/iptables -S OUTPUT 2>/dev/null | grep -q "^-P OUTPUT DROP"'

ENTRYPOINT ["/usr/local/sbin/watchman-entrypoint"]

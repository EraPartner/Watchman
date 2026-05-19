# Watchman devcontainer — runs the full dev stack (backend + frontend) natively
# inside the container, so we don't need Docker-in-Docker.
#
# Plain Debian base with a `dev` user (UID 1000). Nothing here depends on
# any editor; the only consumer is the Claude CLI.
#
# Tools installed by features (devcontainer.json): node, claude-code.
# Tools installed here: gh, firewall plumbing, build basics.
#
# Watchman is a pure Node/TypeScript monorepo (npm workspaces) using DuckDB
# embedded — no Postgres/Python required.

FROM debian:bookworm-slim

ARG TZ=UTC
ENV TZ="$TZ"
ENV DEBIAN_FRONTEND=noninteractive

# Base utilities + a non-root `dev` user (UID 1000) so the bind-mounted
# workspace ownership lines up with the host user. sudo is installed but
# restricted to a narrow allowlist further down.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg lsb-release \
      git sudo less procps jq locales openssh-client unzip rsync \
      iptables ipset dnsutils \
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

# Sudo: narrow allowlist. Grants `dev` no blanket root access, only the
# specific commands post-create / post-start / firewall scripts need.
RUN printf '%s\n' \
      'dev ALL=(root) NOPASSWD: /usr/sbin/iptables, /usr/sbin/iptables-restore, /usr/sbin/iptables-save, /usr/sbin/ip6tables, /usr/sbin/ipset, /usr/sbin/service, /workspaces/Watchman/.devcontainer/init-firewall.sh, /bin/chown, /bin/chmod' \
      > /etc/sudoers.d/dev-watchman \
  && chmod 0440 /etc/sudoers.d/dev-watchman \
  && visudo -c -f /etc/sudoers.d/dev-watchman

# Pre-create ~/.ssh with strict perms so the signing-key bind-mount lands
# in a dev-owned dir (ssh-keygen rejects loose perms on .ssh).
RUN install -d -o dev -g dev -m 0700 /home/dev/.ssh

# Pre-create dirs that will be backed by named Docker volumes. Docker only
# inherits the image-side ownership+perms on FIRST mount of a fresh volume —
# but that one chance matters: without these lines, the volume comes up as
# root:root and dev can't write into it, which silently broke .claude seeding.
RUN install -d -o dev -g dev -m 0700 /home/dev/.claude \
 && install -d -o dev -g dev -m 0755 /home/dev/.config /home/dev/.config/gh

USER dev
WORKDIR /workspaces/Watchman

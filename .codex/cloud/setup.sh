#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"

install -d "$codex_home"
install -m 0644 "$script_dir/AGENTS.md" "$codex_home/AGENTS.md"
touch "$HOME/.bashrc"
grep -Fqx 'export CODEX_SESSION_ENV=cloud' "$HOME/.bashrc" || \
  printf '%s\n' 'export CODEX_SESSION_ENV=cloud' >> "$HOME/.bashrc"

command -v node >/dev/null || { printf '%s\n' 'Node.js is required.' >&2; exit 1; }
command -v npm >/dev/null || { printf '%s\n' 'npm is required.' >&2; exit 1; }

cd "$repo_root"
npm ci

printf '%s\n' 'Watchman cloud setup complete. Service secrets and host checks remain separate.'

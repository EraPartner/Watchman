#!/usr/bin/env bash

watchman_package_env() {
  local name
  local -a clean_env=(
    env -i
    "HOME=$HOME"
    "PATH=$PATH"
    "CODEX_SESSION_ENV=${CODEX_SESSION_ENV:-cloud}"
  )
  for name in \
    HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY \
    http_proxy https_proxy all_proxy no_proxy \
    SSL_CERT_FILE SSL_CERT_DIR NODE_EXTRA_CA_CERTS \
    REQUESTS_CA_BUNDLE CURL_CA_BUNDLE; do
    if printenv "$name" >/dev/null 2>&1; then
      clean_env+=("$name=${!name}")
    fi
  done
  "${clean_env[@]}" "$@"
}

watchman_hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{ print $1 }'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{ print $1 }'
    return
  fi
  printf '%s\n' 'Neither sha256sum nor shasum is available.' >&2
  return 1
}

watchman_fingerprint() {
  local version="$1"
  shift

  {
    printf 'cache-version=%s\n' "$version"
    for file in "$@"; do
      printf 'file=%s\n' "$file"
      if [[ -f "$file" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
          printf '%s\n' "$line"
        done < "$file"
      else
        printf '<missing>\n'
      fi
    done
  } | watchman_hash_stream
}

watchman_write_marker() {
  local marker="$1"
  local value="$2"
  local temporary="${marker}.tmp.$$"
  printf '%s\n' "$value" > "$temporary"
  mv "$temporary" "$marker"
}

watchman_install_dependencies() {
  local script_dir repo_root codex_home state_dir marker fingerprint
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="${WATCHMAN_CLOUD_REPO_ROOT:-$(cd "$script_dir/../.." && pwd)}"
  codex_home="${CODEX_HOME:-$HOME/.codex}"
  state_dir="$codex_home/watchman-cloud-state"
  marker="$state_dir/npm-dependencies.sha256"

  command -v node >/dev/null 2>&1 || {
    printf '%s\n' 'Node.js is required.' >&2
    return 1
  }
  command -v npm >/dev/null 2>&1 || {
    printf '%s\n' 'npm is required.' >&2
    return 1
  }

  install -d -m 0700 "$state_dir"
  cd "$repo_root" || exit 1
  fingerprint="$({
    node --version
    npm --version
    watchman_fingerprint 1 \
      package-lock.json \
      package.json \
      apps/backend/package.json \
      apps/frontend/package.json
  } | watchman_hash_stream)"

  if [[ -f "$marker" ]] && [[ "$(<"$marker")" == "$fingerprint" ]] && \
    [[ -e node_modules/@watchman/backend ]] && \
    [[ -e node_modules/@watchman/frontend ]]; then
    printf '%s\n' '[watchman-cloud] SKIP: npm dependencies are unchanged.'
    return 0
  fi

  printf '%s\n' '[watchman-cloud] Installing root, backend, and frontend dependencies.'
  watchman_package_env node scripts/verify-git-dependencies.mjs || return 1
  watchman_package_env npm ci \
    --allow-git=all \
    --workspace=apps/backend \
    --workspace=apps/frontend \
    --include-workspace-root \
    --no-audit \
    --no-fund || return 1
  watchman_write_marker "$marker" "$fingerprint" || return 1
}

#!/usr/bin/env bash
set -euo pipefail

cloud_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/watchman-cloud-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT

fixture="$test_root/repo"
fake_bin="$test_root/bin"
test_home="$test_root/home"
call_log="$test_home/calls.log"
real_node_dir="$(dirname "$(command -v node)")"
mkdir -p "$fixture/apps/backend" "$fixture/apps/frontend" "$fixture/scripts" "$fake_bin" "$test_home"

printf '{"name":"watchman","private":true}\n' > "$fixture/package.json"
cat > "$fixture/apps/backend/package.json" <<'JSON'
{"dependencies":{"node-roon-api-transport":"github:RoonLabs/node-roon-api-transport#2ee60008a4cdb90c34ff3de58bb4b949067f1d20"}}
JSON
printf '{}\n' > "$fixture/apps/frontend/package.json"
cat > "$fixture/package-lock.json" <<'JSON'
{"lockfileVersion":3,"packages":{"":{"name":"watchman"},"apps/backend":{"dependencies":{"node-roon-api-transport":"github:RoonLabs/node-roon-api-transport#2ee60008a4cdb90c34ff3de58bb4b949067f1d20"}},"apps/frontend":{},"node_modules/node-roon-api-transport":{"version":"2.0.1","resolved":"git+ssh://git@github.com/RoonLabs/node-roon-api-transport.git#2ee60008a4cdb90c34ff3de58bb4b949067f1d20"}}}
JSON
cp "$cloud_dir/../../scripts/verify-git-dependencies.mjs" "$fixture/scripts/"

cat > "$fake_bin/npm" <<'FAKE_NPM'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == --version ]]; then
  printf '%s\n' 11.0.0
  exit 0
fi
printf 'npm:%s\n' "$*" >> "$HOME/calls.log"
printf 'secret:%s\n' "${TEST_SECRET-unset}" >> "$HOME/calls.log"
printf 'proxy:%s\n' "${HTTPS_PROXY-unset}" >> "$HOME/calls.log"
mkdir -p node_modules/@watchman/backend node_modules/@watchman/frontend
FAKE_NPM

chmod +x "$fake_bin/npm"

export HOME="$test_home"
export CODEX_HOME="$test_home/.codex"
export PATH="$fake_bin:$real_node_dir:/usr/bin:/bin"
export WATCHMAN_CLOUD_REPO_ROOT="$fixture"
export TEST_SECRET='must-not-reach-package-code'
export HTTPS_PROXY='http://proxy.example.test:3128'

# shellcheck source=.codex/cloud/lib.sh
source "$cloud_dir/lib.sh"

count_installs() {
  grep -c '^npm:ci ' "$call_log" 2>/dev/null || true
}

watchman_install_dependencies
[[ "$(count_installs)" -eq 1 ]]
grep -Fq 'secret:unset' "$call_log"
grep -Fq 'proxy:http://proxy.example.test:3128' "$call_log"
grep -Fq -- '--workspace=apps/backend --workspace=apps/frontend --include-workspace-root' "$call_log"
grep -Fq -- '--allow-git=all' "$call_log"
if grep -Fq 'apps/desktop' "$call_log"; then
  printf '%s\n' 'Desktop dependencies must not be installed in Codex cloud.' >&2
  exit 1
fi

watchman_install_dependencies
[[ "$(count_installs)" -eq 1 ]]

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const lock = JSON.parse(fs.readFileSync(path, "utf8"));
  lock.testRevision = 1;
  fs.writeFileSync(path, `${JSON.stringify(lock)}\n`);
' "$fixture/package-lock.json"
watchman_install_dependencies
[[ "$(count_installs)" -eq 2 ]]

rm -rf "$fixture/node_modules/@watchman/backend"
watchman_install_dependencies
[[ "$(count_installs)" -eq 3 ]]

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
  manifest.dependencies = { unreviewed: "github:example/unreviewed#deadbeef" };
  fs.writeFileSync(path, `${JSON.stringify(manifest)}\n`);
' "$fixture/apps/frontend/package.json"
if watchman_install_dependencies; then
  printf '%s\n' 'An unreviewed Git dependency must fail before npm runs.' >&2
  exit 1
fi
[[ "$(count_installs)" -eq 3 ]]

printf '%s\n' 'PASS: Watchman cloud dependency cache tests'

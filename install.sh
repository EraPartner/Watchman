#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="$(cd "$(dirname "$0")" && pwd)"
APP_DEST="/Applications/Watchman.app"
LAUNCHER="$REPO_PATH/Launch Watchman.command"

echo "==> Watchman installer"
echo "    Repo: $REPO_PATH"

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  cat <<'EOF'
==> Homebrew is not installed.

This installer can run the official Homebrew installation script from:
    https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh

For maximum security you should review that script before executing it.
The Watchman installer will NOT pipe an unverified script straight into bash.

Recommended:
  1. Install Homebrew yourself by following the instructions at https://brew.sh
  2. Re-run this installer.

Or, if you understand the risk and accept it, set the environment variable
WATCHMAN_ALLOW_BREW_PIPE=1 before re-running:

    WATCHMAN_ALLOW_BREW_PIPE=1 ./install.sh
EOF
  if [ "${WATCHMAN_ALLOW_BREW_PIPE:-0}" != "1" ]; then
    exit 1
  fi
  echo "==> WATCHMAN_ALLOW_BREW_PIPE=1 set — installing Homebrew via official script."
  BREW_INSTALL_TMP="$(mktemp -t watchman_brew_install.XXXXXX)"
  trap 'rm -f "$BREW_INSTALL_TMP"' EXIT
  curl -fsSL --proto '=https' --tlsv1.2 \
    https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
    -o "$BREW_INSTALL_TMP"
  ACTUAL_SHA="$(shasum -a 256 "$BREW_INSTALL_TMP" | awk '{print $1}')"
  echo "    Downloaded Homebrew installer to: $BREW_INSTALL_TMP"
  echo "    SHA-256: $ACTUAL_SHA"
  if [ "${WATCHMAN_BREW_INSTALL_SHA256:-}" != "" ]; then
    EXPECTED="${WATCHMAN_BREW_INSTALL_SHA256}"
    if [ "$EXPECTED" != "$ACTUAL_SHA" ]; then
      echo "ERROR: Homebrew installer checksum mismatch."
      echo "  expected: $EXPECTED"
      echo "  actual:   $ACTUAL_SHA"
      exit 1
    fi
    echo "    Checksum verified."
  elif [ "${WATCHMAN_BREW_INSTALL_AUTO_CONFIRM:-0}" = "1" ]; then
    echo "    WATCHMAN_BREW_INSTALL_AUTO_CONFIRM=1 — skipping interactive confirmation."
  else
    echo ""
    echo "    No WATCHMAN_BREW_INSTALL_SHA256 was provided to verify the download."
    echo "    Compare the SHA-256 above against the published value before continuing."
    echo "    See: https://github.com/Homebrew/install"
    echo ""
    printf "    Continue and execute this installer? [y/N] "
    read -r confirm </dev/tty
    case "$confirm" in
      y|Y|yes|YES) ;;
      *)
        echo "    Aborted by user."
        exit 1
        ;;
    esac
  fi
  /bin/bash "$BREW_INSTALL_TMP"
  rm -f "$BREW_INSTALL_TMP"
  trap - EXIT
  # Add brew to PATH for Apple Silicon
  eval "$(/opt/homebrew/bin/brew shellenv)" 2>/dev/null || true
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "==> Installing Node.js..."
  brew install node
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js 22+ required (found $(node --version 2>/dev/null || echo 'none'))."
  echo "       Upgrade via: brew upgrade node"
  exit 1
fi

# ── npm install (workspaces) ──────────────────────────────────────────────────
echo "==> Installing workspace dependencies..."
cd "$REPO_PATH"
npm install

# ── Build .app ────────────────────────────────────────────────────────────────
echo "==> Building Watchman.app (this takes a minute)..."
npm run dist

# Find the built .app (arm64 or x64) under apps/desktop/out
APP_SRC=""
for candidate in \
  "$REPO_PATH/apps/desktop/out/mac-arm64/Watchman.app" \
  "$REPO_PATH/apps/desktop/out/mac/Watchman.app" \
  "$REPO_PATH/apps/desktop/out/mac-x64/Watchman.app"; do
  if [ -d "$candidate" ]; then
    APP_SRC="$candidate"
    break
  fi
done

if [ -z "$APP_SRC" ]; then
  echo "ERROR: Could not find built Watchman.app in apps/desktop/out/"
  exit 1
fi

# ── Install to /Applications ──────────────────────────────────────────────────
echo "==> Installing to $APP_DEST..."
if [ -d "$APP_DEST" ]; then
  rm -rf "$APP_DEST"
fi
cp -r "$APP_SRC" "$APP_DEST"

# Remove quarantine flag so Gatekeeper doesn't block the self-built app
xattr -cr "$APP_DEST" 2>/dev/null || true

# ── Launch shortcut ──────────────────────────────────────────────────────────
echo "==> Writing launcher: $LAUNCHER"
cat > "$LAUNCHER" <<'LAUNCHER_EOF'
#!/usr/bin/env bash
open /Applications/Watchman.app
LAUNCHER_EOF
chmod +x "$LAUNCHER"

# ── Backend env note ─────────────────────────────────────────────────────────
# The packaged .app is self-contained: it runs the bundled backend with its data
# dir under "~/Library/Application Support/Watchman" and auto-generates an
# encryption key there on first launch (WATCHMAN_MASTER_KEY, used to encrypt
# service secrets at rest). No env configuration is needed to use Watchman.app —
# Watchman runs no-auth on a trusted network by design (ADR-017/ADR-025).
BACKEND_ENV="$REPO_PATH/apps/backend/.env.local"
if [ ! -f "$BACKEND_ENV" ] && [ -f "$REPO_PATH/apps/backend/.env.example" ]; then
  echo "==> Note: Watchman.app needs no configuration — an encryption key is"
  echo "    generated automatically under ~/Library/Application Support/Watchman."
  echo "    To run the backend standalone from the repo instead (npm run dev),"
  echo "    you can create apps/backend/.env.local from the example:"
  echo "      cp apps/backend/.env.example $BACKEND_ENV"
  echo "    WATCHMAN_MASTER_KEY is optional there too (auto-created in DATA_DIR)."
fi

echo ""
echo "  Watchman installed successfully!"
echo "  Open /Applications/Watchman.app or run:"
echo "    open $APP_DEST"
echo "  Or double-click: $LAUNCHER"
echo ""
echo "  From the repo you can also run:"
echo "    npm run electron:prod    # rebuild and launch"
echo "    npm run electron:dev     # launch in dev/watch mode"
echo "    npm run electron:clean   # clean install then launch"

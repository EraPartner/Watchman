#!/usr/bin/env bash
#
# Build distributable Watchman.app artifacts (DMG + zip) and assemble a release
# folder with SHA-256 checksums and a version-stamped README.
#
# Usage:
#   packaging/release/make-release.sh            # build, then assemble
#   packaging/release/make-release.sh --no-build # assemble from existing out/
#
# Output lands in apps/desktop/out/ alongside the artifacts electron-builder
# produced. Publishing to GitHub Releases is configured in
# apps/desktop/electron-builder.yml (run `electron-builder --publish always`
# with a GH_TOKEN if you want automated upload).
set -euo pipefail

REPO_PATH="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$REPO_PATH/apps/desktop/out"
README_SRC="$REPO_PATH/packaging/release/README.md"

VERSION="$(node -p "require('$REPO_PATH/apps/desktop/package.json').version")"
echo "==> Watchman release ${VERSION}"

# ── 1. Build ────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--no-build" ]; then
  echo "==> Cleaning previous artifacts ($OUT_DIR)..."
  rm -rf "$OUT_DIR"
  echo "==> Building app (npm run dist)..."
  (cd "$REPO_PATH" && npm run dist)
else
  echo "==> Skipping build (--no-build); using existing artifacts in out/"
fi

if [ ! -d "$OUT_DIR" ]; then
  echo "ERROR: $OUT_DIR does not exist — nothing to assemble."
  exit 1
fi

# ── 2. Checksums ────────────────────────────────────────────────────────────
echo "==> Generating SHA-256 checksums..."
shopt -s nullglob
artifacts=("$OUT_DIR"/*.dmg "$OUT_DIR"/*.zip)
if [ ${#artifacts[@]} -eq 0 ]; then
  echo "ERROR: no .dmg/.zip artifacts found in $OUT_DIR"
  exit 1
fi
for f in "${artifacts[@]}"; do
  name="$(basename "$f")"
  (cd "$OUT_DIR" && shasum -a 256 "$name" > "${name}.sha256")
  echo "    $name.sha256"
done

# ── 3. Version-stamped README ───────────────────────────────────────────────
echo "==> Writing release README..."
sed "s/__VERSION__/${VERSION}/g" "$README_SRC" > "$OUT_DIR/README.md"

# ── 4. Summary ──────────────────────────────────────────────────────────────
echo ""
echo "==> Release ${VERSION} assembled in:"
echo "    $OUT_DIR"
echo ""
( cd "$OUT_DIR" && ls -1 *.dmg *.zip *.sha256 README.md 2>/dev/null )
echo ""
echo "  Verify with:  shasum -a 256 -c <artifact>.sha256"

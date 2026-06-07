#!/usr/bin/env bash
#
# Build Terax from source and install it over the copy in /Applications.
# macOS only. Produces an ad-hoc signed .app (no updater artifacts, so it
# does not need the maintainer's signing key).
#
# Usage: pnpm install-local   (or ./scripts/install-local.sh)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

APP_NAME="Terax.app"
DEST_DIR="/Applications"
DEST="$DEST_DIR/$APP_NAME"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer targets macOS only." >&2
  exit 1
fi

echo "==> Building Terax (.app bundle, no updater artifacts)..."
# --bundles app: only the .app, skip dmg.
# createUpdaterArtifacts=false: skip the signed update tarball (needs a key).
pnpm tauri build --bundles app \
  -c '{"bundle":{"createUpdaterArtifacts":false}}'

BUILT_APP="$(find src-tauri/target/release/bundle/macos -maxdepth 1 -name "$APP_NAME" -print -quit)"
if [[ -z "${BUILT_APP:-}" || ! -d "$BUILT_APP" ]]; then
  echo "Build finished but $APP_NAME was not found under the bundle dir." >&2
  exit 1
fi

echo "==> Built: $BUILT_APP"

# Quit the running app so the bundle can be replaced cleanly.
if pgrep -x "Terax" >/dev/null 2>&1; then
  echo "==> Quitting running Terax..."
  osascript -e 'tell application "Terax" to quit' >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pgrep -x "Terax" >/dev/null 2>&1 || break
    sleep 0.3
  done
  pkill -x "Terax" >/dev/null 2>&1 || true
fi

echo "==> Installing to $DEST"
rm -rf "$DEST"
cp -R "$BUILT_APP" "$DEST"
# Clear the quarantine flag so Gatekeeper does not block the freshly copied app.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

# Remove the staged bundle so Spotlight does not index it as a second app
# alongside the installed copy in /Applications.
rm -rf "$BUILT_APP"

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$DEST/Contents/Info.plist" 2>/dev/null || echo '?')"
echo "==> Installed Terax $VERSION to $DEST"

if [[ "${1:-}" == "--open" ]]; then
  echo "==> Launching Terax..."
  open "$DEST"
fi

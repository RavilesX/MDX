#!/usr/bin/env bash
# Build MDX and install it for the current user.
#
# Installs to ~/.local so no root is needed, registers the desktop entry and
# the Markdown MIME association, and optionally enables the resident service.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"

PREFIX="${PREFIX:-$HOME/.local}"
BIN_DIR="$PREFIX/bin"
APP_DIR="$PREFIX/share/applications"
ICON_DIR="$PREFIX/share/icons/hicolor"

echo "==> Building"
npm install
npm run app:build

BINARY="src-tauri/target/release/mdx"
[ -x "$BINARY" ] || { echo "Build produced no binary at $BINARY"; exit 1; }

echo "==> Installing to $PREFIX"
install -Dm755 "$BINARY" "$BIN_DIR/mdx"

for size in 32 128; do
  install -Dm644 "src-tauri/icons/${size}x${size}.png" \
    "$ICON_DIR/${size}x${size}/apps/mdx.png"
done
install -Dm644 "src-tauri/icons/icon.png" "$ICON_DIR/512x512/apps/mdx.png"

# %f in the desktop entry needs an absolute Exec when installed under ~/.local.
sed "s|^Exec=mdx|Exec=$BIN_DIR/mdx|" packaging/mdx.desktop > /tmp/mdx.desktop
install -Dm644 /tmp/mdx.desktop "$APP_DIR/mdx.desktop"
rm -f /tmp/mdx.desktop

command -v update-desktop-database >/dev/null && update-desktop-database "$APP_DIR" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_DIR" 2>/dev/null || true

echo "==> Making MDX the default for Markdown"
command -v xdg-mime >/dev/null && xdg-mime default mdx.desktop text/markdown || true

cat <<MSG

Installed: $BIN_DIR/mdx

Make sure $BIN_DIR is on your PATH, then:

    mdx README.md

Optional — keep a warm instance so files open instantly:

    mkdir -p ~/.config/systemd/user
    sed "s|/usr/bin/mdx|$BIN_DIR/mdx|" packaging/mdx.service > ~/.config/systemd/user/mdx.service
    systemctl --user daemon-reload
    systemctl --user enable --now mdx.service
MSG

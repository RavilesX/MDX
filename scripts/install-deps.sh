#!/usr/bin/env bash
# Install what is needed to build MDX on Debian/Ubuntu/Mint.
#
# Only the -dev packages are needed to compile; the runtime libraries are
# already present on any GTK desktop, which is why the finished binary stays
# small and starts against a WebKit that is usually already in memory.
set -euo pipefail

if ! command -v apt-get >/dev/null; then
  echo "This script targets Debian-based systems. On Fedora use:"
  echo "  sudo dnf install webkit2gtk4.1-devel openssl-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel"
  echo "On Arch:"
  echo "  sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl gtk3 libappindicator-gtk3 librsvg"
  exit 1
fi

sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  build-essential \
  curl wget file \
  libssl-dev \
  libxdo-dev \
  pkg-config

if ! command -v cargo >/dev/null && [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  echo "Installing the Rust toolchain…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi

echo
echo "Done. Build with:  npm install && npm run app:build"

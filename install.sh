#!/bin/sh
# Installs the latest BusyHub release on macOS or Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/niklas-schmidt-dev/busyhub/main/install.sh | sh
#
# BUSYHUB_VERSION=v0.1.0   install that release instead of the latest
# BUSYHUB_INSTALL_DIR=...  macOS: where BusyHub.app goes; Linux (AppImage): where the AppImage goes
# BUSYHUB_NO_OPEN=1        do not start BusyHub afterwards
set -eu

REPO="niklas-schmidt-dev/busyhub"
VERSION="${BUSYHUB_VERSION:-latest}"
if [ "$VERSION" = "latest" ]; then
  BASE="https://github.com/$REPO/releases/latest/download"
else
  BASE="https://github.com/$REPO/releases/download/$VERSION"
fi

say() { printf '%s\n' "$*"; }
fail() { printf 'busyhub install: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required"

case "$(uname -m)" in
  x86_64 | amd64) ARCH=x64 ;;
  arm64 | aarch64) ARCH=arm64 ;;
  *) fail "unsupported CPU $(uname -m)" ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

download() {
  say "Downloading $1"
  curl -fL --progress-bar "$BASE/$1" -o "$TMP/$1" || fail "could not download $BASE/$1"
}

install_macos() {
  file="BusyHub-mac-$ARCH.zip"
  download "$file"
  ditto -x -k "$TMP/$file" "$TMP/app"
  dest="${BUSYHUB_INSTALL_DIR:-/Applications}"
  if [ ! -w "$dest" ]; then dest="$HOME/Applications"; fi
  mkdir -p "$dest"
  rm -rf "$dest/BusyHub.app"
  mv "$TMP/app/BusyHub.app" "$dest/BusyHub.app"
  # Releases are ad-hoc signed but not notarized yet; clearing the download quarantine lets macOS open them.
  xattr -dr com.apple.quarantine "$dest/BusyHub.app" 2>/dev/null || true
  say "Installed $dest/BusyHub.app"
  if [ -z "${BUSYHUB_NO_OPEN:-}" ]; then open "$dest/BusyHub.app"; fi
}

install_deb() {
  case "$ARCH" in x64) file="BusyHub-linux-amd64.deb" ;; *) file="BusyHub-linux-arm64.deb" ;; esac
  download "$file"
  say "Installing $file with apt (asks for your password)"
  # apt reads the file as its own user, so it must be readable outside the private temp folder.
  chmod 755 "$TMP" && chmod 644 "$TMP/$file"
  sudo apt-get install -y "$TMP/$file"
  say "Installed BusyHub. Start it from your app menu or with: busyhub"
  if [ -z "${BUSYHUB_NO_OPEN:-}" ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then (busyhub >/dev/null 2>&1 &) || true; fi
}

install_appimage() {
  case "$ARCH" in x64) file="BusyHub-linux-x86_64.AppImage" ;; *) file="BusyHub-linux-arm64.AppImage" ;; esac
  download "$file"
  bin="${BUSYHUB_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$bin"
  mv "$TMP/$file" "$bin/BusyHub.AppImage"
  chmod +x "$bin/BusyHub.AppImage"

  icons="$HOME/.local/share/icons/hicolor/512x512/apps"
  apps="$HOME/.local/share/applications"
  mkdir -p "$icons" "$apps"
  curl -fsSL "https://raw.githubusercontent.com/$REPO/main/assets/branding/busyhub-logo.png" -o "$icons/busyhub.png" || true
  cat >"$apps/busyhub.desktop" <<EOF
[Desktop Entry]
Name=BusyHub
Comment=Run your BUSY Bar apps on the bar or from your computer
Exec="$bin/BusyHub.AppImage" %U
Icon=busyhub
Terminal=false
Type=Application
Categories=Utility;
EOF
  say "Installed $bin/BusyHub.AppImage and added BusyHub to your app menu"
  if ! (ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'); then
    say "Note: AppImages need FUSE 2. On Debian or Ubuntu: sudo apt install libfuse2 (libfuse2t64 on Ubuntu 24.04)"
  fi
}

case "$(uname -s)" in
  Darwin) install_macos ;;
  Linux)
    if command -v apt-get >/dev/null 2>&1 && command -v dpkg >/dev/null 2>&1 && [ -z "${BUSYHUB_INSTALL_DIR:-}" ]; then
      install_deb
    else
      install_appimage
    fi
    ;;
  *) fail "this script is for macOS and Linux; on Windows use install.ps1" ;;
esac

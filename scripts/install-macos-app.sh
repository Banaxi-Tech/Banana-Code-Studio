#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${BANANA_CODE_STUDIO_REPO:-https://github.com/Banaxi-Tech/Banana-Code-Studio.git}"
REF="${BANANA_CODE_STUDIO_REF:-main}"
APP_NAME="Banana Code Studio.app"
INSTALL_DIR="/Applications"
BUILD_ROOT="${TMPDIR:-/tmp}/banana-code-studio-build-$(date +%s)"
SOURCE_DIR="${BUILD_ROOT}/source"

cleanup() {
  if [[ "${KEEP_BUILD_DIR:-0}" == "1" ]]; then
    echo "Keeping build directory: ${BUILD_ROOT}"
  else
    rm -rf "${BUILD_ROOT}"
  fi
}
trap cleanup EXIT

fail() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

run_as_needed() {
  if "$@"; then
    return 0
  fi

  echo "Retrying with sudo: $*"
  sudo "$@"
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This installer must be run on macOS."
fi

require_command git
require_command node
require_command npm
require_command xattr
require_command ditto

ARCH="$(uname -m)"
case "${ARCH}" in
  arm64)
    ELECTRON_ARCH="arm64"
    ;;
  x86_64)
    ELECTRON_ARCH="x64"
    ;;
  *)
    fail "Unsupported macOS architecture: ${ARCH}"
    ;;
esac

echo "Building Banana Code Studio for macOS ${ELECTRON_ARCH}"
echo "Source: ${REPO_URL} (${REF})"

mkdir -p "${BUILD_ROOT}"

if ! git clone --depth 1 --branch "${REF}" "${REPO_URL}" "${SOURCE_DIR}"; then
  echo "Shallow clone failed. Retrying with a full clone..."
  git clone "${REPO_URL}" "${SOURCE_DIR}"
  git -C "${SOURCE_DIR}" checkout "${REF}"
fi

cd "${SOURCE_DIR}"

echo "Installing dependencies..."
npm ci --include=dev

echo "Compiling unsigned .app bundle..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir "--${ELECTRON_ARCH}" --publish never

APP_PATH="dist/mac/${APP_NAME}"
[[ -d "${APP_PATH}" ]] || fail "Build finished, but ${APP_PATH} was not found."

TARGET_PATH="${INSTALL_DIR}/${APP_NAME}"

echo "Installing to ${TARGET_PATH}..."
run_as_needed rm -rf "${TARGET_PATH}"
run_as_needed ditto "${APP_PATH}" "${TARGET_PATH}"

echo "Removing macOS quarantine flag from ${TARGET_PATH}..."
echo "This may require your password."
if ! xattr -dr com.apple.quarantine "${TARGET_PATH}" 2>/dev/null; then
  sudo xattr -dr com.apple.quarantine "${TARGET_PATH}"
fi

echo "Done. Banana Code Studio is installed at ${TARGET_PATH}"
echo "You can open it from Applications."

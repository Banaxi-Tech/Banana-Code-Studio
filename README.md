# Banana Code Studio

Banana Code Studio is a desktop GUI for the Banana Code AI coding assistant.
It is built with Electron and provides a local app interface for connecting to a
Banana Code server, choosing providers/models, managing permissions, and working
with AI coding sessions.

## Features

- Desktop interface for Banana Code
- Setup flow for server URL and API token
- Provider/model selection for supported AI backends
- Markdown rendering with syntax highlighting
- Permission and operating mode controls
- Linux and Windows packaging through Electron Builder

## Requirements

- Node.js 18 or newer
- npm

## Install

```bash
npm install
```

## macOS Source Installer

To build an unsigned `.app` from source on macOS, install it into
`/Applications`, and remove the quarantine flag:

```bash
curl -fsSL https://raw.githubusercontent.com/Banaxi-Tech/Banana-Code-Studio/main/scripts/install-macos-app.sh | bash
```

This requires Node.js, npm, and git on the Mac. The script builds for the
current Mac architecture, either Apple Silicon (`arm64`) or Intel (`x64`).

## Run In Development

```bash
npm start
```

On first launch, Banana Code Studio will ask for the Banana Code server URL and
API token. If available, it can read the local token from:

```text
~/.config/banana-code/token.json
```

## Build

Build the configured package targets:

```bash
npm run build
```

Build specific targets:

```bash
npx electron-builder --linux AppImage deb rpm --x64
npx electron-builder --win nsis --x64
npx electron-builder --mac dir --x64
```

Generated files are written to `dist/`.

## Packaging Notes

- Linux AppImage and `.deb` can be built on Linux with the current setup.
- Linux `.rpm` requires `rpmbuild` to be installed.
- Windows `.exe` is built with the NSIS target.
- macOS `.app` can be produced unsigned from Linux with `--mac dir`.
- macOS `.dmg`, `.pkg`, signing, and notarization require macOS tooling.

## License

MIT License. See `LICENSE` for details.

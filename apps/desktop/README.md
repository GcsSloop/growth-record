# Growth Record Desktop

This directory contains the Tauri 2 desktop shell for macOS and Windows.

## Development

```bash
npm run desktop:dev
```

The desktop development build opens the deployed Growth Record Worker URL in the Tauri WebView.

## Build

macOS:

```bash
npm run desktop:build:mac
```

Windows:

```bash
npm run desktop:build:windows
```

Tauri desktop bundles require the platform-specific Rust and native toolchains. Build macOS artifacts on macOS and Windows artifacts on Windows unless cross-compilation is explicitly configured.

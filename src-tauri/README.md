# Growth Record Desktop

This directory contains the Tauri 2 desktop shell for macOS and Windows.

## Development

```bash
npm run desktop:dev
```

The desktop development build starts the Cloudflare Worker dev server through `npm run dev` and opens the Tauri WebView at `http://localhost:8787`.

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

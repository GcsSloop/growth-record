# Growth Record

Growth Record is a personal growth check-in system being migrated from a single static HTML page to a Cloudflare-native web application.

The target deployment uses Cloudflare Workers for API and access control, Cloudflare Pages-compatible static assets for the web UI, D1 for SQLite storage, Flutter clients for iOS and Android, and Tauri 2 clients for macOS and Windows.

## Features

- Personal growth dashboard and check-in records
- Cloudflare Worker API scaffold named `growth-record`
- D1 database binding and migration workspace
- Authenticated web app and `/admin` management route planned
- Quality gate with TypeScript checks and Vitest coverage thresholds
- Flutter mobile client under `apps/mobile`
- Tauri 2 desktop client for macOS and Windows under `apps/desktop`

## Project Status

This repository is in an incremental migration. The original static page is preserved as `Personal Growth Record-V1.html`; production code is being introduced through PDCA cycles documented in `docs/plans/`.

## Requirements

- Node.js 20+
- npm
- Cloudflare account
- Wrangler CLI, installed through project dev dependencies
- Flutter SDK for mobile shell work
- Rust toolchain and platform build tools for Tauri desktop builds

## Quick Start

```bash
npm install
npm run quality
npm run dev
```

The local Worker health endpoint is available at:

```text
http://localhost:8787/api/health
```

## Quality Gate

Every code change must pass:

```bash
npm run quality
```

The test suite enforces minimum coverage of 85% for lines, statements, branches, and functions.

## Cloudflare Setup

Create a D1 database before production deployment:

```bash
npx wrangler d1 create growth-record
```

Copy the generated database id into `wrangler.toml`, then apply migrations as they are added:

```bash
npx wrangler d1 migrations apply growth-record --local
npx wrangler d1 migrations apply growth-record --remote
```

Deploy:

```bash
npm run deploy
```

## Admin Bootstrap

The default administrator account is `admin`.

On first visit to `/admin`, the system checks `/api/admin/bootstrap`. If the admin password has not been configured, the page shows only the password setup form. After the password is configured, `/admin` shows only the admin login form until an admin session is established.

To enable backend-only admin password recovery, set a secret reset key:

```bash
npx wrangler secret put ADMIN_RESET_KEY
```

Then an operator with access to the deployment secret can clear the admin password state:

```bash
curl -X POST https://growth-record.gcssloop.workers.dev/api/admin/reset-password \
  -H "x-admin-reset-key: <ADMIN_RESET_KEY>"
```

After reset, `/admin` returns to the first-visit password setup state. Do not expose `ADMIN_RESET_KEY` in frontend code, logs, or documentation.

The admin backend can create, list, edit, disable, delete, and reset regular users. Admin-created users receive a generated default password and must change it on first login before normal use. Password resets follow the same rule and invalidate existing sessions for that user.

## Registration And Sessions

Users can register with email and password. Successful registration creates an HttpOnly session cookie valid for 30 days. Authenticated `/api/me` checks refresh the session for another 30 days, so users who keep returning within that window stay signed in. If a user is inactive for more than 30 consecutive days, they must authenticate again.

The user model keeps an optional phone field for admin-managed profile data, but the public web registration flow does not expose phone registration or phone verification.

## Desktop Clients

The Tauri 2 desktop client opens the deployed Growth Record web experience for macOS and Windows.

```bash
npm run desktop:dev
npm run desktop:build:mac
npm run desktop:build:windows
```

macOS bundles should be built on macOS. Windows bundles should be built on Windows unless a dedicated cross-compilation pipeline is added.

## Mobile Clients

The Flutter mobile client uses native email/password authentication before opening the authenticated web experience in a WebView. This avoids shipping a bare WebView-only app and keeps the iOS build closer to App Store review expectations for WebApp-based products: native account entry, native shell structure, and an authenticated content surface.

```bash
npm run mobile:build:android
npm run mobile:build:ios
```

iOS release builds use `--no-codesign` by default so the archive can be produced locally without App Store signing credentials. Final App Store submission still requires a valid Apple Developer account, signing certificates, provisioning profiles, privacy disclosures, and review-ready native behavior.

## Release Artifacts

Native build outputs are collected under versioned folders in `release/`, for example:

```text
release/v0.1.0/growth_record-darwin-arm64-v0.1.0.app
release/v0.1.0/growth_record-darwin-arm64-v0.1.0.dmg
release/v0.1.0/growth_record-android-arm64-v0.1.0.apk
release/v0.1.0/growth_record-ios-arm64-v0.1.0.app
```

## Development Workflow

Work is split into PDCA cycles. Each cycle should:

1. Define the plan and acceptance criteria.
2. Implement the smallest useful slice.
3. Run the quality gate.
4. Commit with a focused message.

## Repository Layout

```text
.
├── Personal Growth Record-V1.html   # Original static page reference
├── docs/plans/                      # PDCA plans and implementation notes
├── migrations/                      # Cloudflare D1 SQL migrations
├── public/                          # Pages-compatible static web assets
├── src/worker/                      # Cloudflare Worker API
├── tests/                           # Unit tests
└── apps/
    ├── desktop/                     # Tauri 2 desktop client for macOS/Windows
    └── mobile/                      # Flutter client for Android/iOS
```

## License

No license has been selected yet. Add one before publishing as an open-source project.

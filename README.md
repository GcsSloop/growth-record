# Growth Record

Growth Record is a personal growth check-in system being migrated from a single static HTML page to a Cloudflare-native web application.

The target deployment uses Cloudflare Workers for API and access control, Cloudflare Pages-compatible static assets for the web UI, D1 for SQLite storage, and Flutter WebView shells for iOS and Android.

## Features

- Personal growth dashboard and check-in records
- Cloudflare Worker API scaffold named `growth-record`
- D1 database binding and migration workspace
- Authenticated web app and `/admin` management route planned
- Quality gate with TypeScript checks and Vitest coverage thresholds
- Flutter mobile shell planned under `apps/mobile`
- Tauri 2 desktop shell for macOS and Windows under `src-tauri`

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

The Tauri 2 desktop shell wraps the same web experience for macOS and Windows.

```bash
npm run desktop:dev
npm run desktop:build:mac
npm run desktop:build:windows
```

macOS bundles should be built on macOS. Windows bundles should be built on Windows unless a dedicated cross-compilation pipeline is added.

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
├── src-tauri/                       # Tauri 2 desktop client for macOS/Windows
├── src/worker/                      # Cloudflare Worker API
├── tests/                           # Unit tests
└── apps/mobile/                     # Flutter WebView shell
```

## License

No license has been selected yet. Add one before publishing as an open-source project.

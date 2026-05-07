# Growth Record Cloudflare Migration PDCA Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the existing static personal growth record page into a Cloudflare Worker/Pages project with D1 storage, authentication, admin management, responsive web UI, and Flutter WebView shell apps.

**Architecture:** Use one Cloudflare Worker named `growth-record` as the API and access-control boundary. Static web assets live under `public/` for Pages-style deployment, while D1 migrations and Worker bindings define durable storage. Flutter apps load the deployed web experience through a native WebView.

**Tech Stack:** Cloudflare Workers, D1 SQLite, TypeScript, Wrangler, Vitest, static HTML/CSS/JS, Flutter, WebView.

---

## PDCA 1: Project Foundation

**Plan:** Initialize Git and create the Cloudflare-ready project structure.

**Do:** Add package metadata, Wrangler config, TypeScript config, Vitest config, environment type declarations, and ignore rules.

**Check:** Run package installation and the baseline test command.

**Act:** Commit as `chore: initialize cloudflare project scaffold`.

## PDCA 2: D1 Storage and API Boundaries

**Plan:** Define database schema and Worker route boundaries before implementing full business behavior.

**Do:** Add D1 migrations for users, sessions, phone verification codes, records, settings, audit/activity events, and admin-friendly indexes. Add Worker modules for routing, JSON responses, auth placeholders, and health endpoints.

**Check:** Run TypeScript check and unit tests for route helpers.

**Act:** Commit as `feat: add d1 schema and worker api skeleton`.

## PDCA 3: Web App Shell

**Plan:** Preserve the current visual direction while moving toward a deployable web app.

**Do:** Add `public/index.html`, `public/admin.html`, shared CSS, and JS app shells. Keep the existing static page as the source reference and expose authenticated page placeholders.

**Check:** Run static smoke tests and verify expected files exist.

**Act:** Commit as `feat: add responsive web and admin shells`.

## PDCA 4: Flutter Shell Apps

**Plan:** Provide a minimal iOS/Android Flutter project that embeds the web app.

**Do:** Add `apps/mobile/pubspec.yaml`, app entrypoint, WebView screen, and environment-based web URL configuration notes.

**Check:** Run a lightweight file/layout verification. If Flutter SDK is available, run `flutter analyze`.

**Act:** Commit as `feat: add flutter webview mobile shell`.

## PDCA 5: Next Iterations

After the scaffold is stable, implement these as separate cycles:

1. Account/password and phone registration/login.
2. Session cookies and per-user data isolation.
3. Record/settings CRUD backed by D1.
4. Admin user management and activity analytics.
5. SMS provider integration.
6. Full responsive migration of the current dashboard.
7. Deployment documentation and Cloudflare setup guide.

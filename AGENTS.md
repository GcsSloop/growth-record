# AGENTS.md

This document defines the working rules for AI and human contributors in this repository.

## Mission

Migrate the original single-file personal growth dashboard into a maintainable Cloudflare-native product while preserving the current visual direction and user experience.

## Non-Negotiable Quality Gate

Before every commit, run:

```bash
npm run quality
```

Coverage must stay at or above 85% for lines, statements, branches, and functions. Do not lower thresholds without explicit project-owner approval.

## PDCA Workflow

Every implementation cycle must be small and committed separately:

1. **Plan:** State the cycle objective and files involved.
2. **Do:** Implement only that cycle.
3. **Check:** Run the quality gate and any focused smoke checks.
4. **Act:** Commit with a clear message.

## Architecture Rules

- Worker name is `growth-record`.
- D1 is the source of truth for durable app data.
- User data must always be scoped by `user_id`.
- Admin routes must require an admin role.
- Static web assets live in `public/`.
- Worker API code lives in `src/worker/`.
- Shared type-safe helpers should be small and tested.

## Security Rules

- Never store plaintext passwords.
- Prefer HttpOnly cookies for sessions.
- Treat phone verification codes as short-lived secrets.
- Do not log passwords, verification codes, session tokens, or API keys.
- Keep `.dev.vars` and `.env*` files out of Git.

## Frontend Rules

- Preserve the dark/gold visual style from `Personal Growth Record-V1.html`.
- Web pages must adapt to mobile, tablet, and desktop.
- `/admin` must match the product style but remain utilitarian and data-dense.
- Avoid large UI rewrites unless the current PDCA cycle explicitly calls for it.

## Mobile Rules

- Flutter apps are WebView shells first.
- The web URL must be configurable for local, staging, and production builds.
- Do not add store publishing metadata until requested.

## Git Rules

- Keep commits focused to one PDCA cycle.
- Do not rewrite unrelated files.
- Do not remove the original static HTML reference until the migration is complete and approved.

---
name: deploy-worker
description: Deploy the Growth Record Cloudflare Worker manually or through the dpw-vX.Y.Z GitHub Actions tag flow.
---

# Deploy Worker

Use this skill when deploying the `growth-record` Cloudflare Worker or explaining how CI deployment works.

## Local Deployment

1. Confirm dependencies and tests:
   ```bash
   npm ci
   npm run quality
   ```
2. Confirm Cloudflare auth:
   ```bash
   npx wrangler whoami
   ```
3. Apply D1 migrations when schema changed:
   ```bash
   npx wrangler d1 migrations apply growth-record --remote
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

## CI Deployment

Pushing a tag such as `dpw-v0.1.0` triggers `.github/workflows/deploy-worker.yml`.

The workflow:
- verifies the tag commit is reachable from `origin/master`;
- installs Node dependencies;
- runs `npm run quality`;
- deploys with `npx wrangler deploy`.

Required GitHub repository secrets:
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with Worker deploy permissions for this account.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account id.

Never commit Cloudflare tokens, account secrets, `.dev.vars`, or `.env*` files.

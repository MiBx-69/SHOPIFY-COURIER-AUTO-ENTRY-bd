# Shopify Multi-Courier Dispatch Platform

Production-oriented, mobile-first Shopify order dispatch for REDX, Pathao, and Steadfast. Shopify is the source of truth; Supabase stores synchronized operational state behind RLS.

## What is implemented

- Next.js App Router UI with responsive desktop/sidebar and mobile/bottom navigation, PWA manifest, accessible loading/empty/error states, search/filter, order details, tracking, safe bulk dispatch and realtime refresh.
- Supabase Auth with email fallback and the current experimental passkey API isolated in `src/lib/auth/passkeys.ts`.
- Multi-organization/store model, roles, server authorization, RLS on every tenant/security table, and private credentials protected by no authenticated/anon grants plus AES-256-GCM envelope encryption.
- Shopify authorization-code install, HMAC/state verification, GraphQL Admin API, webhook registration/verification/deduplication, initial/reconciliation job queue, order/product snapshots and dispatch metafields.
- Provider interface plus live request implementations for REDX, Pathao, and Steadfast. Each requires the merchant’s real credentials; no production mock path exists.
- Transactional `claim_dispatch` lock + unique order/idempotency constraints prevent duplicate courier shipment creation. Unknown courier outcomes remain unknown until reconciliation; they are never blindly retried.

## Local setup

1. Install Node 20+ and the Supabase CLI. Copy `.env.example` to `.env.local`, then supply the real values.
2. Create a Supabase project. In Auth, configure the application URL and enable **Passkeys (Beta)** with RP ID `localhost` for local testing. Apply the migration: `supabase link --project-ref YOUR_REF`, then `supabase db push`.
3. In Supabase Auth, add `http://localhost:3000/auth/callback` to redirect URLs. Enable email magic links for the fallback.
4. Create a Shopify app in the Partner/Dev Dashboard. Set its app URL to `http://localhost:3000`, callback to `http://localhost:3000/api/shopify/callback`, copy client ID/secret to `.env.local`, and configure the scopes in `shopify.app.toml`. For live webhooks use an HTTPS tunnel or deployed URL, then update `SHOPIFY_APP_URL` and deploy the app configuration.
5. Create a random 32-byte encryption key, for example: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, and place it in `ENCRYPTION_KEY`.
6. Configure one courier through the authenticated `PATCH /api/couriers?shopId=...` route with real merchant credentials. REDX requires `apiToken`; Pathao needs `clientId`, `clientSecret`, `username`, `password`, `storeId`; Steadfast needs `apiKey`, `secretKey`. Set the appropriate API base URL environment variable or encrypted per-store `baseUrl` from the courier’s merchant documentation.
7. Run `npm run dev`, sign in by email, connect the `.myshopify.com` store in Settings, register a passkey, run Sync Now, test the courier connection, then dispatch an eligible real order.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:rls
npm run build
```

For a database-level RLS test against a local Supabase stack, run `supabase test db`. The included `supabase/tests/tenant_isolation.sql` asserts RLS activation; extend it with real locally seeded User A/User B JWT fixtures before a production release.

## Deployment/security checklist

- Never add a service-role key, Shopify access token, courier credential, or `ENCRYPTION_KEY` to `NEXT_PUBLIC_*` values.
- Set production URLs/HTTPS, Supabase Auth redirect allow-list, Shopify callback/webhook URLs, CSP frame ancestors, SMTP, error monitoring, database backups, cron queue consumer, and a real external rate-limit store (the in-process limit is intentionally only a development baseline).
- Deploy `supabase/functions/shopify-webhook` when using Supabase webhook ingress, or use the built-in Next webhook endpoint—choose a single URL per topic to avoid duplicate delivery paths.
- Before go-live exercise a real dev store and each courier sandbox/merchant account, concurrency dispatches, unknown timeout recovery, webhook retries, and an RLS cross-tenant attempt.

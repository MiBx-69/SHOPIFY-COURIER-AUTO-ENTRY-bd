# Edge Functions

`shopify-webhook` is the production webhook ingress: it verifies Shopify HMAC before it writes a deduplicated event and queues a sync job. It needs `SHOPIFY_CLIENT_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as function secrets.

`sync-shop` is an authenticated scheduling entry point. The Next.js service is the worker that contains the shared Shopify GraphQL mapping and encrypted credential handling; run it from a protected cron/queue consumer to claim `sync_jobs`. This keeps only one implementation of Shopify/courier business logic.

Deploy with the current Supabase CLI after linking a project:

```bash
supabase secrets set SHOPIFY_CLIENT_SECRET=... SUPABASE_SERVICE_ROLE_KEY=...
supabase functions deploy shopify-webhook --no-verify-jwt
supabase functions deploy sync-shop
```

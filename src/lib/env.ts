import { z } from "zod";

// Converts empty strings to undefined so optional fields can be left blank in .env.local
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === "" ? undefined : val), schema);

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10)
});

// SUPABASE_SECRET_KEY is the current recommended name.
// SUPABASE_SERVICE_ROLE_KEY is accepted as a backward-compatible fallback so
// existing .env.local files continue to work without immediate manual rename.
const serverSchema = publicSchema.extend({
  // ── Supabase ────────────────────────────────────────────────────────────
  SUPABASE_SECRET_KEY: emptyToUndefined(z.string().min(10).optional()),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(10).optional()),

  // ── Shopify OAuth ───────────────────────────────────────────────────────
  // Only required in /api/shopify/install and /api/shopify/callback routes.
  // Made optional here so pages that don't use Shopify OAuth can still load.
  SHOPIFY_CLIENT_ID: emptyToUndefined(z.string().min(1).optional()),
  SHOPIFY_CLIENT_SECRET: emptyToUndefined(z.string().min(1).optional()),
  SHOPIFY_APP_URL: z.string().url().default("http://localhost:3000"),
  SHOPIFY_API_VERSION: z.string().regex(/^20\d{2}-\d{2}$/).default("2026-07"),
  SHOPIFY_SCOPES: emptyToUndefined(z.string().min(1).optional()),

  // ── Encryption ──────────────────────────────────────────────────────────
  ENCRYPTION_KEY: emptyToUndefined(z.string().min(40).optional()),

  // ── Courier base URLs ───────────────────────────────────────────────────
  // Optional — can be overridden per-credential via the Settings UI instead.
  REDX_API_URL: emptyToUndefined(z.string().url().optional()),
  PATHAO_API_URL: emptyToUndefined(z.string().url().optional()),
  STEADFAST_API_URL: emptyToUndefined(z.string().url().optional()),

  // ── Telegram Alerting ───────────────────────────────────────────────────
  // Optional — configure in Settings → Notifications to enable Telegram alerts.
  TELEGRAM_BOT_TOKEN: emptyToUndefined(z.string().min(10).optional()),
  TELEGRAM_CHAT_ID: emptyToUndefined(z.string().min(1).optional()),

  // ── Redis Caching ───────────────────────────────────────────────────────
  UPSTASH_REDIS_REST_URL: emptyToUndefined(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: emptyToUndefined(z.string().min(1).optional())
}).refine(
  (d) => Boolean(d.SUPABASE_SECRET_KEY || d.SUPABASE_SERVICE_ROLE_KEY),
  { message: "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in .env.local" }
);

export const publicEnv = () => publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
});

export const serverEnv = () => {
  const raw = serverSchema.parse(process.env);
  // Normalize: whichever name is present becomes the canonical supabaseSecretKey
  const supabaseSecretKey = raw.SUPABASE_SECRET_KEY ?? raw.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return { ...raw, supabaseSecretKey };
};

/**
 * Call this in Shopify OAuth routes (/api/shopify/install, /api/shopify/callback).
 * Throws a clear error if the Shopify app credentials are not configured.
 */
export const requireShopifyEnv = () => {
  const env = serverEnv();
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new Error(
      "SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set in .env.local to use Shopify OAuth"
    );
  }
  return {
    ...env,
    SHOPIFY_CLIENT_ID: env.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: env.SHOPIFY_CLIENT_SECRET,
    SHOPIFY_SCOPES: env.SHOPIFY_SCOPES ?? ""
  };
};

/**
 * Call this in routes that encrypt/decrypt credentials.
 * Throws a clear error if the encryption key is not configured.
 */
export const requireEncryptionKey = () => {
  const env = serverEnv();
  if (!env.ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY must be set in .env.local");
  }
  return env.ENCRYPTION_KEY;
};

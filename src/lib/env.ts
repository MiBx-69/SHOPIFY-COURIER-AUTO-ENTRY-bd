import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10)
});

// SUPABASE_SECRET_KEY is the current recommended name.
// SUPABASE_SERVICE_ROLE_KEY is accepted as a backward-compatible fallback so
// existing .env.local files continue to work without immediate manual rename.
const serverSchema = publicSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  SHOPIFY_CLIENT_ID: z.string().min(1),
  SHOPIFY_CLIENT_SECRET: z.string().min(1),
  SHOPIFY_APP_URL: z.string().url(),
  SHOPIFY_API_VERSION: z.string().regex(/^20\d{2}-\d{2}$/).default("2026-07"),
  SHOPIFY_SCOPES: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(40),
  REDX_API_URL: z.string().url().optional(),
  PATHAO_API_URL: z.string().url().optional(),
  STEADFAST_API_URL: z.string().url().optional()
}).refine(
  (d) => Boolean(d.SUPABASE_SECRET_KEY || d.SUPABASE_SERVICE_ROLE_KEY),
  { message: "Either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set" }
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

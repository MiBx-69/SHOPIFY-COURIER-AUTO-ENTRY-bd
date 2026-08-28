import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

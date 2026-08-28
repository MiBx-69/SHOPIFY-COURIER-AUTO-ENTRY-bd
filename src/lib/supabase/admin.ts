import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (url, opts) => fetch(url, { ...opts, signal: opts?.signal || AbortSignal.timeout(6000) })
    }
  });
}

import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
};

export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  // 1. Try standard Supabase getUser()
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      return data.user as SessionUser;
    }
  } catch {
    // Network or timeout occurred during remote verification
  }

  // 2. Fallback: Parse Supabase session cookie directly
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const authCookie = allCookies.find((c) => c.name.includes("-auth-token"));

    if (authCookie?.value) {
      let raw = authCookie.value;
      if (raw.startsWith("base64-")) {
        raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
      }
      
      let token: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed);
      } catch {
        token = raw;
      }

      if (typeof token === "string" && token.includes(".")) {
        const parts = token.split(".");
        if (parts.length >= 2) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
          // Check expiration (payload.exp is in seconds)
          if (!payload.exp || payload.exp * 1000 > Date.now()) {
            return {
              id: payload.sub,
              email: payload.email,
              user_metadata: payload.user_metadata || {},
              app_metadata: payload.app_metadata || {}
            };
          }
        }
      }
    }
  } catch {
    // Failed to parse cookie
  }

  return null;
}

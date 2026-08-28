import { cookies } from "next/headers";

export type SessionUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
};

export async function getAuthenticatedUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();

    // 1. Find all Supabase auth cookie chunks
    const authCookies = allCookies
      .filter((c) => c.name.includes("-auth-token"))
      .sort((a, b) => a.name.localeCompare(b.name));

    // If no auth cookie exists, user is definitely not logged in (instant 0ms exit)
    if (authCookies.length === 0) {
      return null;
    }

    // 2. Reassemble chunked cookie values
    let raw = authCookies.map((c) => c.value).join("");
    
    // Handle URL encoding if present
    if (raw.includes("%")) {
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // use raw
      }
    }

    // Handle Supabase base64- prefix
    if (raw.startsWith("base64-")) {
      raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
    }

    // 3. Extract access token
    let token: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      token = Array.isArray(parsed) ? parsed[0] : (parsed.access_token || parsed);
    } catch {
      token = raw;
    }

    // 4. Validate JWT payload
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
  } catch {
    // Parsing error
  }

  return null;
}

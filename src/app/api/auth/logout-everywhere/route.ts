import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/auth";

// POST /api/auth/logout-everywhere — revoke all sessions for this user
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Record security event before revoking (non-blocking)
    (async () => {
      try {
        await admin
          .from("security_events")
          .insert({ user_id: user.id, event_type: "logout_everywhere", metadata: { scope: "global", initiated_at: new Date().toISOString() } });
      } catch {}
    })();

    // Revoke all other sessions via admin API (Supabase admin.auth.signOut)
    // scope: "others" revokes all sessions except the current one
    const { error: revokeError } = await admin.auth.admin.signOut(user.id);
    if (revokeError) throw revokeError;

    // Also sign out the current session
    await supabase.auth.signOut({ scope: "local" });

    return NextResponse.json({
      success: true,
      message: "All sessions have been revoked. You have been signed out from all devices."
    });
  } catch (error) {
    return apiError(error);
  }
}

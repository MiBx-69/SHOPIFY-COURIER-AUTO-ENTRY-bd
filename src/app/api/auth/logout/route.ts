import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/api/auth";

// POST /api/auth/logout — sign out current device session
export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Record security event (non-blocking)
    (async () => {
      try {
        await createAdminClient()
          .from("security_events")
          .insert({ user_id: user.id, event_type: "logout", metadata: { scope: "current_device" } });
      } catch { /* ignored */ }
    })();

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;

    return NextResponse.json({ success: true, message: "Signed out from current device." });
  } catch (error) {
    return apiError(error);
  }
}

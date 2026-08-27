import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type"); // "recovery" for password reset links

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Password reset emails include type=recovery — send to the reset form
  if (type === "recovery") {
    return NextResponse.redirect(new URL("/auth/reset-password", url.origin));
  }

  // Invitations include type=invite — send to the accept invitation onboarding flow
  if (type === "invite") {
    return NextResponse.redirect(new URL("/accept-invitation", url.origin));
  }

  return NextResponse.redirect(new URL("/orders", url.origin));
}

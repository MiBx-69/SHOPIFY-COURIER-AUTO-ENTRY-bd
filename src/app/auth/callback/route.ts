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

  return NextResponse.redirect(new URL("/orders", url.origin));
}

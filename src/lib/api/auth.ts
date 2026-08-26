import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function currentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError(401, "Authentication required");
  return { user, supabase };
}
export async function requireShopPermission(shopId: string, permission: string) {
  const { user } = await currentUser();
  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("id,organization_id").eq("id", shopId).maybeSingle();
  if (!shop) throw new ApiError(404, "Resource not found");
  const { data: membership } = await admin.from("memberships").select("role").eq("organization_id", shop.organization_id).eq("user_id", user.id).maybeSingle();
  const roles: Record<string, string[]> = { owner: ["*"], admin: ["*"], manager: ["view_orders","dispatch_orders","view_dispatch_history","manage_couriers","manage_members","manage_settings","view_audit_logs"], dispatcher: ["view_orders","dispatch_orders","view_dispatch_history"], viewer: ["view_orders","view_dispatch_history"] };
  if (!membership || !(roles[membership.role]?.includes("*") || roles[membership.role]?.includes(permission))) throw new ApiError(403, "You are not permitted to perform this action");
  return { user, shop, membership };
}
export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message === "RATE_LIMITED") return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  
  // Log unexpected errors so we can debug them in Vercel/terminal
  console.error("[API Error]", error);
  
  // Temporarily expose the actual error to the browser for debugging
  const errorMessage = error instanceof Error ? error.message : typeof error === 'object' ? JSON.stringify(error) : String(error);
  return NextResponse.json({ error: `Debug Error: ${errorMessage}` }, { status: 500 });
}

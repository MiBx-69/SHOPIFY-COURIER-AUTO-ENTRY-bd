import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createErrorId } from "@/lib/errors";

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
  const roles: Record<string, string[]> = {
    owner: ["*"],
    admin: ["*"],
    manager: ["view_orders","dispatch_orders","view_dispatch_history","manage_couriers","manage_members","manage_settings","view_audit_logs","manage_shopify"],
    dispatcher: ["view_orders","dispatch_orders","view_dispatch_history"],
    viewer: ["view_orders","view_dispatch_history"]
  };
  if (!membership || !(roles[membership.role]?.includes("*") || roles[membership.role]?.includes(permission))) {
    throw new ApiError(403, "You are not permitted to perform this action");
  }
  return { user, shop, membership };
}

export function apiError(error: unknown) {
  const errorId = createErrorId();

  if (error instanceof ApiError) {
    return NextResponse.json({ success: false, error: error.message, errorId }, { status: error.status });
  }

  if (error instanceof Error && error.message === "RATE_LIMITED") {
    return NextResponse.json({ success: false, error: "Too many requests. Please try again shortly.", errorId }, { status: 429 });
  }

  // Zod validation errors
  if (error instanceof Error && error.name === "ZodError") {
    return NextResponse.json({ success: false, error: "Invalid request data. Please check your input.", errorId }, { status: 400 });
  }

  console.error(JSON.stringify({
    level: "ERROR",
    errorId,
    timestamp: new Date().toISOString(),
    service: "api",
    message: error instanceof Error ? error.message : String(error),
    stack: process.env.NODE_ENV !== "production" && error instanceof Error ? error.stack : undefined,
  }));

  // Async Telegram alert — never blocks response
  import("@/lib/notifications/telegram")
    .then(({ telegramNotifier }) => telegramNotifier.sendAlert({
      errorId,
      timestamp: new Date().toISOString(),
      severity: "ERROR",
      category: "UNKNOWN_ERROR",
      service: "api",
      safeMessage: "Something went wrong while processing your request.",
      httpStatus: 500,
      internalMessage: error instanceof Error ? error.message : String(error),
    }))
    .catch(() => { /* Telegram failure must never crash */ });

  return NextResponse.json({ success: false, error: "Something went wrong while processing your request.", errorId }, { status: 500 });
}

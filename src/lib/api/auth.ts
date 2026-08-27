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

  // Extract PostgREST / Postgres error fields if present
  const isPgError = error && typeof error === "object" && "code" in error && "message" in error;
  const pgError = isPgError ? (error as any) : null;
  const errorMessage = pgError ? pgError.message : (error instanceof Error ? error.message : (typeof error === "object" ? JSON.stringify(error) : String(error)));

  const logPayload = {
    level: "ERROR",
    errorId,
    timestamp: new Date().toISOString(),
    service: "api",
    message: errorMessage,
    ...(pgError ? { dbCode: pgError.code, details: pgError.details, hint: pgError.hint } : {}),
    stack: process.env.NODE_ENV !== "production" && error instanceof Error ? error.stack : undefined,
  };

  console.error(JSON.stringify(logPayload));

  // Async Telegram alert — never blocks response
  import("@/lib/notifications/telegram")
    .then(({ telegramNotifier }) => telegramNotifier.sendAlert({
      errorId,
      timestamp: new Date().toISOString(),
      severity: "ERROR",
      category: pgError ? "DATABASE_ERROR" : "UNKNOWN_ERROR",
      service: "api",
      safeMessage: "Something went wrong while processing your request.",
      httpStatus: 500,
      internalMessage: errorMessage + (pgError ? ` (Code: ${pgError.code}, Hint: ${pgError.hint})` : ""),
    }))
    .catch(() => { /* Telegram failure must never crash */ });

  return NextResponse.json({ success: false, error: "Something went wrong while processing your request.", errorId }, { status: 500 });
}

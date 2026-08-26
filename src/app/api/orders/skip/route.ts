import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const skipSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(250),
  reason: z.string().max(500).optional()
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const body = skipSchema.parse(await request.json());
    const admin = createAdminClient();

    // 1. Authorize user membership
    const { data: memberships } = await admin
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", user.id);

    const allowedRoles = ["owner", "admin", "manager", "dispatcher"];
    const authorizedOrgIds = (memberships || [])
      .filter((m: { organization_id: string; role: string }) => allowedRoles.includes(m.role))
      .map((m: { organization_id: string }) => m.organization_id);

    if (!authorizedOrgIds.length) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { data: shops } = await admin
      .from("shops")
      .select("id")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));

    // 2. Fetch and filter authorized orders
    const { data: orders } = await admin
      .from("orders")
      .select("id, name, shop_id, dispatch_status")
      .in("id", body.orderIds);

    const authorizedOrders = (orders || []).filter((o: { id: string; shop_id: string }) => authorizedShopIds.has(o.shop_id));

    if (!authorizedOrders.length) {
      return NextResponse.json({ error: "No authorized orders found to skip" }, { status: 404 });
    }

    // 3. Record skip events and mark state
    const now = new Date().toISOString();
    const reasonText = body.reason || "Removed from dispatch queue by staff";

    await Promise.all(
      authorizedOrders.map(async (order: { id: string; name: string; shop_id: string }) => {
        // Insert event into order_events
        await admin.from("order_events").insert({
          shop_id: order.shop_id,
          order_id: order.id,
          event_type: "dispatch_skipped",
          payload: {
            reason: reasonText,
            skipped_by: user.id,
            skipped_at: now
          }
        });
      })
    );

    return NextResponse.json({
      success: true,
      count: authorizedOrders.length,
      message: `${authorizedOrders.length} order${authorizedOrders.length > 1 ? "s" : ""} removed from dispatch`
    });
  } catch (error) {
    return apiError(error);
  }
}

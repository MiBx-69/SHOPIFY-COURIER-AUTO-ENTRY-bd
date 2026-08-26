import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const restoreSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(250)
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const body = restoreSchema.parse(await request.json());
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

    // 2. Fetch authorized orders
    const { data: orders } = await admin
      .from("orders")
      .select("id, name, shop_id, dispatch_status")
      .in("id", body.orderIds);

    const authorizedOrders = (orders || []).filter((o: { id: string; shop_id: string }) => authorizedShopIds.has(o.shop_id));

    if (!authorizedOrders.length) {
      return NextResponse.json({ error: "No authorized orders found to restore" }, { status: 404 });
    }

    const now = new Date().toISOString();

    await Promise.all(
      authorizedOrders.map(async (order: { id: string; name: string; shop_id: string }) => {
        // Record restored event in order_events
        await admin.from("order_events").insert({
          shop_id: order.shop_id,
          order_id: order.id,
          event_type: "dispatch_restored",
          payload: {
            restored_by: user.id,
            restored_at: now
          }
        });

        // Ensure order is not_dispatched in orders table
        await admin.from("orders").update({ dispatch_status: "not_dispatched" }).eq("id", order.id);
      })
    );

    return NextResponse.json({
      success: true,
      count: authorizedOrders.length,
      message: `${authorizedOrders.length} order${authorizedOrders.length > 1 ? "s" : ""} restored to dispatch queue`
    });
  } catch (error) {
    return apiError(error);
  }
}

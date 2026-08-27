import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const restoreSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(250).optional(),
  orderId: z.string().uuid().optional()
}).refine((value) => Boolean(value.orderIds?.length || value.orderId), { message: "orderId or orderIds is required" });

export async function POST(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const body = restoreSchema.parse(await request.json());
    const orderIds = body.orderIds?.length ? body.orderIds : [body.orderId!];
    const admin = createAdminClient();

    const { data: memberships, error: membershipError } = await admin.from("memberships").select("organization_id, role").eq("user_id", user.id);
    if (membershipError) throw membershipError;
    const allowedRoles = ["owner", "admin", "manager", "dispatcher"];
    const authorizedOrgIds = (memberships || []).filter((m: { organization_id: string; role: string }) => allowedRoles.includes(m.role)).map((m: { organization_id: string }) => m.organization_id);
    if (!authorizedOrgIds.length) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data: shops, error: shopError } = await admin.from("shops").select("id").in("organization_id", authorizedOrgIds);
    if (shopError) throw shopError;
    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));

    const { data: orders, error: orderError } = await admin.from("orders").select("id, name, shop_id, dispatch_status").in("id", orderIds);
    if (orderError) throw orderError;
    const authorizedOrders = (orders || []).filter((o: { id: string; shop_id: string }) => authorizedShopIds.has(o.shop_id));
    if (!authorizedOrders.length) return NextResponse.json({ error: "No authorized orders found to restore" }, { status: 404 });

    const now = new Date().toISOString();
    const { error: eventError } = await admin.from("order_events").insert(authorizedOrders.map((order: { id: string; shop_id: string }) => ({
      shop_id: order.shop_id,
      order_id: order.id,
      event_type: "dispatch_restored",
      payload: { restored_by: user.id, restored_at: now },
      occurred_at: now
    })));
    if (eventError) throw eventError;

    const { error: updateError } = await admin.from("orders").update({ dispatch_status: "not_dispatched", updated_at: now }).in("id", authorizedOrders.map((o: { id: string }) => o.id));
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, count: authorizedOrders.length, message: `${authorizedOrders.length} order${authorizedOrders.length > 1 ? "s" : ""} restored to dispatch queue` });
  } catch (error) {
    return apiError(error);
  }
}

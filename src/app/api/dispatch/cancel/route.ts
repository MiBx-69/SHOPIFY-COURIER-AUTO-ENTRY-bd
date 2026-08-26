import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { z } from "zod";

const cancelDispatchSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(250),
  reason: z.string().max(500).optional()
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const body = cancelDispatchSchema.parse(await request.json());
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
      return NextResponse.json({ error: "Unauthorized to cancel dispatches" }, { status: 403 });
    }

    const { data: shops } = await admin
      .from("shops")
      .select("id")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));

    // 2. Fetch orders
    const { data: orders } = await admin
      .from("orders")
      .select("id, name, shop_id, dispatch_status")
      .in("id", body.orderIds);

    const orderMap = new Map((orders || []).map((o: { id: string; name: string; shop_id: string; dispatch_status: string }) => [o.id, o]));
    const dispatchService = new DispatchService();

    // 3. Process cancellation safely per order
    const results = await Promise.all(
      body.orderIds.map(async (orderId) => {
        const order = orderMap.get(orderId);
        if (!order || !authorizedShopIds.has(order.shop_id)) {
          return {
            orderId,
            orderName: order?.name || "Order",
            status: "failed" as const,
            reason: "Order not found or unauthorized"
          };
        }

        try {
          const res = await dispatchService.cancel(orderId, user.id, body.reason);
          return {
            orderId,
            orderName: order.name,
            status: "cancelled" as const,
            message: res.message
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Cancellation failed";
          const isUnsupported = msg.toLowerCase().includes("not supported");
          return {
            orderId,
            orderName: order.name,
            status: isUnsupported ? ("unsupported" as const) : ("failed" as const),
            reason: msg
          };
        }
      })
    );

    const cancelledCount = results.filter((r) => r.status === "cancelled").length;
    const unsupportedCount = results.filter((r) => r.status === "unsupported").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      data: results,
      summary: {
        total: results.length,
        cancelled: cancelledCount,
        unsupported: unsupportedCount,
        failed: failedCount
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

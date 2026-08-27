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
      .select("id, organization_id")
      .in("organization_id", authorizedOrgIds);

    const authorizedShopIds = new Set((shops || []).map((s: { id: string }) => s.id));
    const shopOrgMap = new Map((shops || []).map((s: { id: string; organization_id: string }) => [s.id, s.organization_id]));

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

    (async () => {
      try {
        const auditRecords = results.map(r => {
          const order = orderMap.get(r.orderId);
          if (!order) return null;
          return {
            organization_id: shopOrgMap.get(order.shop_id),
            shop_id: order.shop_id,
            actor_id: user.id,
            action: "dispatch.cancel",
            entity_type: "order",
            entity_id: r.orderId,
            metadata: {
              status: r.status,
              reason: body.reason,
              error_reason: "reason" in r ? r.reason : undefined
            }
          };
        }).filter(r => r && r.organization_id);
        if (auditRecords.length) await admin.from("audit_logs").insert(auditRecords);
        
        // Invalidate Redis cache for affected shops
        const { invalidateCountsCache } = await import("@/lib/redis");
        const shopIdsToInvalidate = Array.from(new Set(results.map((r) => orderMap.get(r.orderId)?.shop_id).filter(Boolean))) as string[];
        if (shopIdsToInvalidate.length > 0) {
          await invalidateCountsCache(shopIdsToInvalidate);
        }
      } catch { /* ignored */ }
    })();

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

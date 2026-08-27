import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchRequestSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    await enforceRateLimit(`dispatch:${user.id}`, 20);
    const body = dispatchRequestSchema.parse(await request.json());

    // API-level authorization check (defense-in-depth)
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("shop_id").eq("id", body.orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    await requireShopPermission(order.shop_id, "dispatch_orders");

    const { data: dispatch, error } = await supabase.rpc("claim_dispatch", {
      p_order_id: body.orderId,
      p_idempotency_key: body.idempotencyKey
    });

    if (error || !dispatch) {
      const errMsg = error?.message || "Failed to claim order for dispatch";
      console.warn(`[DISPATCH CLAIM REJECTED] order_id=${body.orderId} user_id=${user.id} error="${errMsg}"`);

      const isConcurrent = errMsg.toLowerCase().includes("already in progress");
      return NextResponse.json({ 
        success: false,
        error: isConcurrent ? "Dispatch is already in progress for this order." : errMsg
      }, { status: isConcurrent ? 409 : 400 });
    }

    console.info(`[DISPATCH CLAIM ACQUIRED] dispatch_id=${dispatch.id} order_id=${body.orderId} user_id=${user.id}`);

    const result = await new DispatchService().execute(
      dispatch.id,
      body.courierConfigId,
      body.pickupLocationId,
      user.id
    );

    if (!result.success) {
      return NextResponse.json({
        success: false,
        status: result.status,
        error: result.error || "Courier dispatch rejected shipment",
        data: result.data
      }, { status: result.status === "unknown" ? 502 : 422 });
    }

    (async () => {
      try {
        const admin = createAdminClient();
        const { data: order } = await admin.from("orders").select("shop_id").eq("id", body.orderId).maybeSingle();
        if (order) {
          const { data: shop } = await admin.from("shops").select("organization_id").eq("id", order.shop_id).maybeSingle();
          
          // Invalidate cache since order state changed
          const { invalidateCountsCache } = await import("@/lib/redis");
          await invalidateCountsCache([order.shop_id]);
          
          if (shop) {
            await admin.from("audit_logs").insert({
              organization_id: shop.organization_id,
              shop_id: order.shop_id,
              actor_id: user.id,
              action: "dispatch.single",
              entity_type: "order",
              entity_id: body.orderId,
              metadata: {
                status: result.status,
                tracking_id: result.trackingId,
                courier_name: result.courierName
              }
            });
          }
        }
      } catch { /* ignored */ }
    })();

    return NextResponse.json({
      success: true,
      status: result.status,
      trackingId: result.trackingId,
      courierReference: result.courierReference,
      courierName: result.courierName,
      message: result.message,
      data: result.data
    }, { status: 200 });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchRequestSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { resolveCourierConfigId } from "@/services/dispatch/courier-routing";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { invalidateOrderCaches } from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    await enforceRateLimit(`redispatch:${user.id}`, 20);
    const body = dispatchRequestSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,name,shop_id,shipping_method,shipping_method_code,dispatch_status,is_skipped,cancelled_at")
      .eq("id", body.orderId)
      .single();
    if (orderError || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    await requireShopPermission(order.shop_id, "dispatch_orders");

    if (order.cancelled_at) {
      return NextResponse.json({ success: false, error: "Cancelled Shopify orders cannot be redispatched." }, { status: 422 });
    }

    if (order.dispatch_status === "dispatched") {
      return NextResponse.json({ success: false, error: "Order is already dispatched." }, { status: 409 });
    }

    // V1 intentionally scopes one-click redispatch to failed/skipped work. A
    // cancelled courier shipment can be added later with provider-specific
    // cancellation/reuse handling.
    if (!order.is_skipped && order.dispatch_status !== "failed") {
      return NextResponse.json({ success: false, error: "Only skipped or failed orders can be redispatched." }, { status: 422 });
    }

    const { data: shop } = await admin
      .from("shops")
      .select("organization_id,redispatch_enabled,automatic_courier")
      .eq("id", order.shop_id)
      .single();

    if (!shop?.redispatch_enabled) {
      return NextResponse.json({ success: false, error: "Redispatch is disabled in Dispatch Settings." }, { status: 403 });
    }

    let courierConfigId = body.courierConfigId;
    if (!courierConfigId && shop.automatic_courier) {
      courierConfigId = await resolveCourierConfigId(
        admin,
        order.shop_id,
        order.shipping_method,
        order.shipping_method_code,
        true
      );
    }

    if (!courierConfigId) {
      return NextResponse.json({ success: false, error: "No courier could be selected for redispatch. Enable Automatic Courier Selection or select a courier." }, { status: 400 });
    }

    // Clear the skip/failure queue state before claim_dispatch. The RPC then
    // locks the order and transitions the existing dispatch record safely.
    const now = new Date().toISOString();
    const { error: restoreError } = await admin
      .from("orders")
      .update({ is_skipped: false, dispatch_status: "not_dispatched", updated_at: now })
      .eq("id", order.id);
    if (restoreError) throw restoreError;

    const { error: eventError } = await admin.from("order_events").insert({
      shop_id: order.shop_id,
      order_id: order.id,
      event_type: "dispatch_redispatched",
      payload: {
        redispatched_by: user.id,
        previous_dispatch_status: order.dispatch_status,
        previous_is_skipped: Boolean(order.is_skipped),
        redispatched_at: now
      },
      occurred_at: now
    });
    if (eventError) throw eventError;

    const { data: dispatch, error: claimError } = await supabase.rpc("claim_dispatch", {
      p_order_id: order.id,
      p_idempotency_key: body.idempotencyKey
    });

    if (claimError || !dispatch) {
      const message = claimError?.message || "Failed to claim order for redispatch";
      const concurrent = message.toLowerCase().includes("already in progress");
      return NextResponse.json({
        success: false,
        error: concurrent ? "Dispatch is already in progress for this order." : message
      }, { status: concurrent ? 409 : 422 });
    }

    const result = await new DispatchService().execute(
      dispatch.id,
      courierConfigId,
      body.pickupLocationId,
      user.id
    );

    await invalidateOrderCaches([order.shop_id]);

    try {
      if (shop.organization_id) {
        await admin.from("audit_logs").insert({
          organization_id: shop.organization_id,
          shop_id: order.shop_id,
          actor_id: user.id,
          action: "dispatch.redispatch",
          entity_type: "order",
          entity_id: order.id,
          metadata: {
            status: result.status,
            tracking_id: result.trackingId,
            courier_name: result.courierName,
            shipping_method: order.shipping_method,
            shipping_method_code: order.shipping_method_code
          }
        });
      }
    } catch (auditError) {
      console.warn("Failed to write redispatch audit log:", auditError);
    }

    if (!result.success) {
      return NextResponse.json({
        success: false,
        status: result.status,
        error: result.error || "Redispatch failed",
        data: result.data
      }, { status: result.status === "unknown" ? 502 : 422 });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      trackingId: result.trackingId,
      courierReference: result.courierReference,
      courierName: result.courierName,
      message: result.message || `Order ${order.name} redispatched successfully.`,
      data: result.data
    });
  } catch (error) {
    return apiError(error);
  }
}

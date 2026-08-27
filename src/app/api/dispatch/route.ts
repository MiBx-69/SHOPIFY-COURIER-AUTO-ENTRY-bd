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
    await enforceRateLimit(`dispatch:${user.id}`, 20);
    const body = dispatchRequestSchema.parse(await request.json());

    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("shop_id,shipping_method,shipping_method_code")
      .eq("id", body.orderId)
      .single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    await requireShopPermission(order.shop_id, "dispatch_orders");

    const { data: shop } = await admin
      .from("shops")
      .select("automatic_courier")
      .eq("id", order.shop_id)
      .single();

    let courierConfigId = body.courierConfigId;
    if (!courierConfigId && shop?.automatic_courier) {
      courierConfigId = await resolveCourierConfigId(
        admin,
        order.shop_id,
        order.shipping_method,
        order.shipping_method_code,
        true
      );
    }

    if (!courierConfigId) {
      return NextResponse.json({ success: false, error: "Select a courier before dispatching, or enable Automatic Courier Selection." }, { status: 400 });
    }

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
      courierConfigId,
      body.pickupLocationId,
      user.id
    );

    // Invalidate before responding so the next counts/list request cannot read stale state.
    await invalidateOrderCaches([order.shop_id]);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        status: result.status,
        error: result.error || "Courier dispatch rejected shipment",
        data: result.data
      }, { status: result.status === "unknown" ? 502 : 422 });
    }

    try {
      const { data: auditShop } = await admin
        .from("shops")
        .select("organization_id")
        .eq("id", order.shop_id)
        .maybeSingle();
      if (auditShop) {
        await admin.from("audit_logs").insert({
          organization_id: auditShop.organization_id,
          shop_id: order.shop_id,
          actor_id: user.id,
          action: "dispatch.single",
          entity_type: "order",
          entity_id: body.orderId,
          metadata: {
            status: result.status,
            tracking_id: result.trackingId,
            courier_name: result.courierName,
            shipping_method: order.shipping_method,
            shipping_method_code: order.shipping_method_code,
            courier_config_id: courierConfigId
          }
        });
      }
    } catch (auditError) {
      console.warn("Failed to write dispatch audit log:", auditError);
    }

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

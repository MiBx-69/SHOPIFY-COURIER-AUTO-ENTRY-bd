import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { dispatchRequestSchema } from "@/lib/validation/schemas";
import { DispatchService } from "@/services/dispatch/dispatch-service";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    enforceRateLimit(`dispatch:${user.id}`, 20);
    const body = dispatchRequestSchema.parse(await request.json());

    const { data: dispatch, error } = await supabase.rpc("claim_dispatch", {
      p_order_id: body.orderId,
      p_idempotency_key: body.idempotencyKey
    });

    if (error || !dispatch) {
      return NextResponse.json({ 
        success: false,
        error: "This order cannot be claimed for dispatch or is already being processed." 
      }, { status: 409 });
    }

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

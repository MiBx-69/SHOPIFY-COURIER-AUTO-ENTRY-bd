import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await currentUser();
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

    // 1. Fetch active skipped orders for this shop
    const { data: skipEvents } = await supabase
      .from("order_events")
      .select("order_id, event_type, occurred_at")
      .eq("shop_id", shopId)
      .in("event_type", ["dispatch_skipped", "dispatch_restored"])
      .order("occurred_at", { ascending: true });

    const activeSkippedOrderIds = new Set<string>();
    (skipEvents || []).forEach((ev: { order_id: string; event_type: string }) => {
      if (ev.event_type === "dispatch_skipped") {
        activeSkippedOrderIds.add(ev.order_id);
      } else if (ev.event_type === "dispatch_restored") {
        activeSkippedOrderIds.delete(ev.order_id);
      }
    });

    const skippedArray = Array.from(activeSkippedOrderIds);

    // 2. Query exact counts in parallel with tenant isolation
    const [
      allRes,
      readyRes,
      unfulfilledRes,
      pendingRes,
      attentionRes,
      dispatchedRes,
      failedRes,
      onHoldRes,
      partialRes,
      fulfilledRes,
      cancelledRes
    ] = await Promise.all([
      // Total all
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      // Ready: not cancelled, not fulfilled, not dispatched, has phone, not skipped
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .neq("fulfillment_status", "FULFILLED")
        .neq("dispatch_status", "dispatched")
        .not("customer_phone", "is", null),
      // Unfulfilled: not cancelled, unfulfilled, not dispatched
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .eq("fulfillment_status", "UNFULFILLED")
        .neq("dispatch_status", "dispatched"),
      // Pending
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .eq("financial_status", "PENDING"),
      // Attention: not cancelled, (failed or missing phone or missing address)
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .or("dispatch_status.eq.failed,customer_phone.is.null,shipping_address.eq.{}"),
      // Dispatched
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("dispatch_status", "dispatched"),
      // Failed
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("dispatch_status", "failed"),
      // On Hold
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .eq("fulfillment_status", "ON_HOLD"),
      // Partial
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .is("cancelled_at", null)
        .eq("fulfillment_status", "PARTIALLY_FULFILLED"),
      // Fulfilled
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("fulfillment_status", "FULFILLED"),
      // Cancelled (ONLY Shopify cancelled orders)
      supabase.from("orders").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .not("cancelled_at", "is", null)
    ]);

    const counts = {
      all: allRes.count || 0,
      ready: Math.max(0, (readyRes.count || 0) - skippedArray.length),
      unfulfilled: Math.max(0, (unfulfilledRes.count || 0) - skippedArray.length),
      pending: pendingRes.count || 0,
      attention: attentionRes.count || 0,
      dispatched: dispatchedRes.count || 0,
      skipped: skippedArray.length,
      failed: failedRes.count || 0,
      on_hold: onHoldRes.count || 0,
      partially_fulfilled: partialRes.count || 0,
      fulfilled: fulfilledRes.count || 0,
      cancelled: cancelledRes.count || 0
    };

    return NextResponse.json({ data: counts });
  } catch (error) {
    return apiError(error);
  }
}

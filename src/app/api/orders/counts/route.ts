import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";
import { redis } from "@/lib/redis";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { supabase } = await currentUser();
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

    const cacheKey = `counts:${shopId}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          // If cached was stringified, parse it, otherwise use it directly
          const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
          return NextResponse.json({ data }, {
            headers: {
              "X-Cache": "HIT",
              "X-Response-Time": `${Date.now() - startTime}ms`
            }
          });
        }
      } catch (err) {
        console.warn("Redis cache read error:", err);
      }
    }

    const { data: skipEvents, error: skipError } = await supabase.from("order_events")
      .select("order_id, event_type, occurred_at").eq("shop_id", shopId)
      .in("event_type", ["dispatch_skipped", "dispatch_restored"])
      .order("occurred_at", { ascending: true });
    if (skipError) throw skipError;

    const activeSkippedOrderIds = new Set<string>();
    (skipEvents || []).forEach((ev: { order_id: string; event_type: string }) => {
      if (ev.event_type === "dispatch_skipped") activeSkippedOrderIds.add(ev.order_id);
      else if (ev.event_type === "dispatch_restored") activeSkippedOrderIds.delete(ev.order_id);
    });
    const skippedCount = activeSkippedOrderIds.size;

    const [allRes, readyRes, unfulfilledRes, pendingRes, attentionRes, dispatchedRes, failedRes, onHoldRes, partialRes, fulfilledRes, cancelledRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).neq("fulfillment_status", "FULFILLED").neq("dispatch_status", "dispatched").not("customer_phone", "is", null),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).eq("fulfillment_status", "UNFULFILLED").neq("dispatch_status", "dispatched"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).eq("financial_status", "PENDING"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).or("dispatch_status.eq.failed,customer_phone.is.null,shipping_address.eq.{}"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("dispatch_status", "dispatched"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("dispatch_status", "failed"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).eq("fulfillment_status", "ON_HOLD"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).is("cancelled_at", null).eq("fulfillment_status", "PARTIALLY_FULFILLED"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("fulfillment_status", "FULFILLED"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).not("cancelled_at", "is", null)
    ]);

    for (const result of [allRes, readyRes, unfulfilledRes, pendingRes, attentionRes, dispatchedRes, failedRes, onHoldRes, partialRes, fulfilledRes, cancelledRes]) {
      if (result.error) throw result.error;
    }

    const data = {
      all: allRes.count || 0,
      ready: Math.max(0, (readyRes.count || 0) - skippedCount),
      unfulfilled: Math.max(0, (unfulfilledRes.count || 0) - skippedCount),
      pending: pendingRes.count || 0,
      attention: attentionRes.count || 0,
      dispatched: dispatchedRes.count || 0,
      skipped: skippedCount,
      failed: failedRes.count || 0,
      on_hold: onHoldRes.count || 0,
      partially_fulfilled: partialRes.count || 0,
      fulfilled: fulfilledRes.count || 0,
      cancelled: cancelledRes.count || 0
    };

    if (redis) {
      try {
        await redis.set(cacheKey, data, { ex: 60 });
      } catch (err) {
        console.warn("Redis cache write error:", err);
      }
    }

    return NextResponse.json({ data }, {
      headers: {
        "X-Cache": "MISS",
        "X-Response-Time": `${Date.now() - startTime}ms`
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

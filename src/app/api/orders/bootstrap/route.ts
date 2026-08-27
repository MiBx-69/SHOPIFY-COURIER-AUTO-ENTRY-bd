import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getCache, setCache, generateCacheKey } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { user, supabase } = await currentUser();
    await enforceRateLimit(`bootstrap:${user.id}`, 60);

    const p = request.nextUrl.searchParams;
    const shopId = p.get("shopId");
    const organizationId = p.get("organizationId") || "default";
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });

    const filter = (p.get("filter") || p.get("tab") || "ready").toLowerCase();
    const size = Math.min(200, Math.max(1, Number(p.get("size") || 25)));

    // Try to fetch from cache first
    const cacheKey = generateCacheKey(organizationId, shopId, "orders:bootstrap", { filter, size });
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          "X-Cache": "HIT",
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      });
    }

    // Prepare queries
    // 1. Orders
    let ordersQuery = supabase
      .from("orders")
      .select(
        "id,name,order_number,customer_name,customer_phone,customer_email,total_minor,currency,financial_status,fulfillment_status,dispatch_status,shopify_created_at,shopify_updated_at,cancelled_at,is_skipped,order_line_items(id,title,variant_title,sku,quantity,unit_price_minor,total_price_minor),dispatches(id,status,tracking_id,courier_status,dispatched_at,courier_configs(id,couriers(display_name)))",
        { count: "estimated" }
      )
      .eq("shop_id", shopId)
      .order("shopify_created_at", { ascending: false, nullsFirst: false })
      .range(0, size - 1);

    if (filter === "ready") {
      ordersQuery = ordersQuery.is("cancelled_at", null).neq("fulfillment_status", "FULFILLED").neq("dispatch_status", "dispatched").not("customer_phone", "is", null).eq("is_skipped", false);
    } else if (filter === "unfulfilled") {
      ordersQuery = ordersQuery.is("cancelled_at", null).eq("fulfillment_status", "UNFULFILLED").neq("dispatch_status", "dispatched").eq("is_skipped", false);
    } else if (filter === "pending") {
      ordersQuery = ordersQuery.is("cancelled_at", null).eq("financial_status", "PENDING");
    } else if (filter === "attention") {
      ordersQuery = ordersQuery.is("cancelled_at", null).or("dispatch_status.eq.failed,customer_phone.is.null");
    } else if (filter === "skipped") {
      ordersQuery = ordersQuery.eq("is_skipped", true);
    } else if (filter === "on_hold") {
      ordersQuery = ordersQuery.is("cancelled_at", null).eq("fulfillment_status", "ON_HOLD");
    } else if (filter === "partially_fulfilled") {
      ordersQuery = ordersQuery.is("cancelled_at", null).eq("fulfillment_status", "PARTIALLY_FULFILLED");
    } else if (filter === "fulfilled") {
      ordersQuery = ordersQuery.eq("fulfillment_status", "FULFILLED");
    } else if (filter === "dispatched") {
      ordersQuery = ordersQuery.eq("dispatch_status", "dispatched");
    } else if (filter === "failed") {
      ordersQuery = ordersQuery.eq("dispatch_status", "failed");
    } else if (filter === "cancelled") {
      ordersQuery = ordersQuery.not("cancelled_at", "is", null);
    }

    // Execute everything in parallel
    const [ordersRes, countsRes, couriersRes] = await Promise.all([
      ordersQuery,
      supabase.rpc("get_order_counts", { p_shop_id: shopId }).single(),
      supabase.from("courier_configs").select("id,courier_id,priority,enabled,couriers(provider,display_name)").eq("shop_id", shopId).eq("enabled", true).order("priority")
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (countsRes.error) throw countsRes.error;
    if (couriersRes.error) throw couriersRes.error;

    const counts = countsRes.data as any;
    const responsePayload = {
      orders: {
        data: ordersRes.data || [],
        count: ordersRes.count || 0,
        page: 0,
        size
      },
      counts: {
        all: Number(counts.all_count || 0),
        ready: Number(counts.ready_count || 0),
        unfulfilled: Number(counts.unfulfilled_count || 0),
        pending: Number(counts.pending_count || 0),
        attention: Number(counts.attention_count || 0),
        dispatched: Number(counts.dispatched_count || 0),
        failed: Number(counts.failed_count || 0),
        on_hold: Number(counts.on_hold_count || 0),
        partially_fulfilled: Number(counts.partially_fulfilled_count || 0),
        fulfilled: Number(counts.fulfilled_count || 0),
        cancelled: Number(counts.cancelled_count || 0),
        skipped: Number(counts.skipped_count || 0)
      },
      couriers: couriersRes.data || []
    };

    // Cache the unified payload
    await setCache(cacheKey, responsePayload, 15);

    return NextResponse.json(responsePayload, {
      headers: {
        "X-Cache": "MISS",
        "X-Response-Time": `${Date.now() - startTime}ms`
      }
    });
  } catch (error) {
    console.error("Bootstrap Route Error: ", JSON.stringify(error, null, 2));
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";
import { getCache, setCache, generateCacheKey } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { supabase } = await currentUser();
    const shopId = request.nextUrl.searchParams.get("shopId");
    const organizationId = request.nextUrl.searchParams.get("organizationId") || "default";
    if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

    const cacheKey = generateCacheKey(organizationId, shopId, "orders:counts", {});
    
    const cached = await getCache(cacheKey);
    if (cached) {
      return NextResponse.json({ data: cached }, {
        headers: {
          "X-Cache": "HIT",
          "X-Response-Time": `${Date.now() - startTime}ms`
        }
      });
    }

    const { data: countsRes, error } = await supabase.rpc("get_order_counts", { p_shop_id: shopId }).single();
    if (error) throw error;
    
    const counts = countsRes as any;

    const data = {
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
    };

    await setCache(cacheKey, data, 15); // Cache for 15 seconds

    return NextResponse.json({ data }, {
      headers: {
        "X-Cache": "MISS",
        "X-Response-Time": `${Date.now() - startTime}ms`
      }
    });
  } catch (error) {
    console.error("Counts Route Error: ", JSON.stringify(error, null, 2));
    return apiError(error);
  }
}

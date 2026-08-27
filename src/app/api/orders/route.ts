import { NextRequest, NextResponse } from "next/server";
import { currentUser, apiError } from "@/lib/api/auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";

// Helper to compute date ranges
function getDateRange(preset: string, startParam?: string | null, endParam?: string | null) {
  const now = new Date();
  let fromDate: Date | null = null;
  let toDate: Date | null = null;

  if (preset === "today") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (preset === "yesterday") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  } else if (preset === "7d" || preset === "7_days") {
    fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    toDate = now;
  } else if (preset === "30d" || preset === "30_days") {
    fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    toDate = now;
  } else if (preset === "month" || preset === "this_month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    toDate = now;
  } else if (preset === "last_month") {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    toDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (preset === "custom" && startParam) {
    fromDate = new Date(startParam);
    toDate = endParam ? new Date(endParam) : now;
  }

  return { fromDate, toDate };
}

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    enforceRateLimit(`orders:${user.id}`, 90);
    const p = request.nextUrl.searchParams;
    const shopId = p.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });

    const page = Math.max(0, Number(p.get("page") || 0));
    const size = Math.min(200, Math.max(1, Number(p.get("size") || 50)));
    const filter = (p.get("filter") || p.get("tab") || "ready").toLowerCase();
    const search = p.get("q")?.trim();

    // Advanced filters
    const datePreset = p.get("date");
    const startDate = p.get("startDate");
    const endDate = p.get("endDate");
    const dateField = p.get("dateField") || "shopify_created_at";
    const payment = p.get("payment")?.toLowerCase();
    const fulfillment = p.get("fulfillment")?.toLowerCase();
    const courier = p.get("courier")?.toLowerCase();
    const minAmount = p.get("minAmount") ? Number(p.get("minAmount")) * 100 : null;
    const maxAmount = p.get("maxAmount") ? Number(p.get("maxAmount")) * 100 : null;

    // Fetch active skipped orders for this shop
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

    let query = supabase
      .from("orders")
      .select(
        "id,name,order_number,customer_name,customer_phone,customer_email,shipping_address,billing_address,note,total_minor,subtotal_minor,discount_minor,shipping_minor,currency,financial_status,fulfillment_status,dispatch_status,shopify_created_at,shopify_updated_at,cancelled_at,order_line_items(id,title,variant_title,sku,quantity,unit_price_minor,total_price_minor),dispatches(id,status,phase,tracking_id,courier_reference,courier_status,safe_error_message,dispatched_at,courier_configs(id,couriers(provider,display_name)))",
        { count: "estimated" }
      )
      .eq("shop_id", shopId)
      .order("shopify_created_at", { ascending: false, nullsFirst: false })
      .range(page * size, page * size + size - 1);

    // ─── TAB / SECTION FILTERING ───
    if (filter === "ready") {
      // Primary Queue: not cancelled, not fulfilled, not dispatched, has phone & address, not skipped
      query = query
        .is("cancelled_at", null)
        .neq("fulfillment_status", "FULFILLED")
        .neq("dispatch_status", "dispatched")
        .not("customer_phone", "is", null);

      if (skippedArray.length > 0) {
        query = query.not("id", "in", `(${skippedArray.join(",")})`);
      }
    } else if (filter === "unfulfilled") {
      // Unfulfilled: Must NOT include cancelled orders or dispatched orders or skipped
      query = query
        .is("cancelled_at", null)
        .eq("fulfillment_status", "UNFULFILLED")
        .neq("dispatch_status", "dispatched");

      if (skippedArray.length > 0) {
        query = query.not("id", "in", `(${skippedArray.join(",")})`);
      }
    } else if (filter === "pending") {
      // Pending Payment: Must NOT include cancelled orders
      query = query
        .is("cancelled_at", null)
        .eq("financial_status", "PENDING");
    } else if (filter === "attention") {
      // Attention Required: not cancelled, has failed dispatch OR missing phone OR missing address
      query = query
        .is("cancelled_at", null)
        .or("dispatch_status.eq.failed,customer_phone.is.null,shipping_address.eq.{}");
    } else if (filter === "skipped") {
      // Skipped Orders
      if (skippedArray.length > 0) {
        query = query.in("id", skippedArray);
      } else {
        // Return empty result
        query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      }
    } else if (filter === "on_hold") {
      query = query
        .is("cancelled_at", null)
        .eq("fulfillment_status", "ON_HOLD");
    } else if (filter === "partially_fulfilled") {
      query = query
        .is("cancelled_at", null)
        .eq("fulfillment_status", "PARTIALLY_FULFILLED");
    } else if (filter === "fulfilled") {
      query = query.eq("fulfillment_status", "FULFILLED");
    } else if (filter === "dispatched") {
      query = query.eq("dispatch_status", "dispatched");
    } else if (filter === "failed") {
      query = query.eq("dispatch_status", "failed");
    } else if (filter === "cancelled") {
      // Cancelled orders ONLY
      query = query.not("cancelled_at", "is", null);
    }

    // ─── DATE FILTER ───
    if (datePreset) {
      const { fromDate, toDate } = getDateRange(datePreset, startDate, endDate);
      const targetColumn = ["shopify_created_at", "shopify_updated_at", "dispatched_at"].includes(dateField)
        ? dateField
        : "shopify_created_at";

      if (fromDate) {
        query = query.gte(targetColumn, fromDate.toISOString());
      }
      if (toDate) {
        query = query.lte(targetColumn, toDate.toISOString());
      }
    }

    // ─── PAYMENT FILTER ───
    if (payment && payment !== "all") {
      if (payment === "cod" || payment === "pending") {
        query = query.or("financial_status.ilike.pending,financial_status.ilike.authorized");
      } else if (payment === "paid") {
        query = query.ilike("financial_status", "paid");
      } else if (payment === "partially_paid") {
        query = query.ilike("financial_status", "partially_paid");
      } else if (payment === "refunded") {
        query = query.ilike("financial_status", "refunded");
      } else if (payment === "voided") {
        query = query.ilike("financial_status", "voided");
      }
    }

    // ─── FULFILLMENT FILTER ───
    if (fulfillment && fulfillment !== "all") {
      if (fulfillment === "cancelled") {
        query = query.not("cancelled_at", "is", null);
      } else {
        query = query.ilike("fulfillment_status", fulfillment);
      }
    }

    // ─── AMOUNT RANGE ───
    if (minAmount !== null && !isNaN(minAmount)) {
      query = query.gte("total_minor", minAmount);
    }
    if (maxAmount !== null && !isNaN(maxAmount)) {
      query = query.lte("total_minor", maxAmount);
    }

    // ─── COURIER FILTER ───
    if (courier && courier !== "all") {
      if (courier === "none") {
        query = query.eq("dispatch_status", "not_dispatched");
      } else {
        const { data: configs } = await supabase
          .from("courier_configs")
          .select("id, couriers!inner(provider)")
          .eq("shop_id", shopId)
          .eq("couriers.provider", courier);

        const configIds = (configs || []).map((c: { id: string }) => c.id);
        if (configIds.length > 0) {
          const { data: matchedDispatches } = await supabase
            .from("dispatches")
            .select("order_id")
            .eq("shop_id", shopId)
            .in("courier_config_id", configIds);

          const matchedOrderIds = (matchedDispatches || []).map((d: { order_id: string }) => d.order_id);
          if (matchedOrderIds.length > 0) {
            query = query.in("id", matchedOrderIds);
          } else {
            query = query.eq("id", "00000000-0000-0000-0000-000000000000");
          }
        } else {
          query = query.eq("id", "00000000-0000-0000-0000-000000000000");
        }
      }
    }

    // ─── SEARCH QUERY ───
    if (search) {
      const [{ data: dispatchOrders }, { data: itemOrders }] = await Promise.all([
        supabase.from("dispatches").select("order_id").eq("shop_id", shopId).ilike("tracking_id", `%${search}%`).limit(100),
        supabase.from("order_line_items").select("order_id").eq("shop_id", shopId).or(`sku.ilike.%${search}%,title.ilike.%${search}%`).limit(100)
      ]);

      const matchedIds = Array.from(new Set([
        ...(dispatchOrders?.map((d: { order_id: string }) => d.order_id) || []),
        ...(itemOrders?.map((i: { order_id: string }) => i.order_id) || [])
      ])).filter(Boolean);

      if (matchedIds.length > 0) {
        query = query.or(
          `name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%,id.in.(${matchedIds.join(",")})`
        );
      } else {
        query = query.or(
          `name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%`
        );
      }
    }

    const { data, count, error } = await query;
    if (error) throw error;

    // Attach active skipped flag to order items
    const enrichedData = (data || []).map((o: { id: string }) => ({
      ...o,
      is_skipped: activeSkippedOrderIds.has(o.id)
    }));

    return NextResponse.json({
      data: enrichedData,
      count: count || 0,
      page,
      size,
      activeSkippedCount: activeSkippedOrderIds.size
    });
  } catch (error) {
    return apiError(error);
  }
}

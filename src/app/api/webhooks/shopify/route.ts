import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPayload, safeShopDomain, verifyWebhook } from "@/lib/security/shopify";
import { invalidateOrderCaches } from "@/lib/cache";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  try {
    const domain = safeShopDomain(request.headers.get("x-shopify-shop-domain") || "");
    const webhookId = request.headers.get("x-shopify-webhook-id");
    const topic = request.headers.get("x-shopify-topic");
    if (!webhookId || !topic) return NextResponse.json({ error: "Invalid webhook headers" }, { status: 400 });

    const payload = JSON.parse(raw) as Record<string, unknown>;
    const admin = createAdminClient();
    const { data: shop } = await admin.from("shops").select("id,organization_id").eq("shop_domain", domain).maybeSingle();
    if (!shop) return new NextResponse(null, { status: 200 });

    const eventRow = {
      webhook_id: webhookId,
      shop_id: shop.id,
      topic,
      api_version: request.headers.get("x-shopify-api-version"),
      payload_hash: hashPayload(raw),
      payload
    };

    const { data: inserted, error: insertError } = await admin.from("webhook_events").insert(eventRow).select("id").maybeSingle();
    if (insertError && insertError.code !== "23505") throw insertError;

    let eventId = inserted?.id as string | undefined;
    if (!eventId) {
      const { data: existing, error: existingError } = await admin.from("webhook_events")
        .select("id,status").eq("shop_id", shop.id).eq("webhook_id", webhookId).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return new NextResponse(null, { status: 200 });
      if (existing.status === "processed" || existing.status === "processing") return new NextResponse(null, { status: 200 });
      eventId = existing.id;
    }

    // Claim processing so concurrent Shopify retries do not process the same event twice.
    const { data: claimed, error: claimError } = await admin.from("webhook_events")
      .update({ status: "processing", error: null })
      .eq("id", eventId)
      .in("status", ["received", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return new NextResponse(null, { status: 200 });

    const kind = topic.startsWith("orders/") ? "orders" : topic.startsWith("products/") ? "products" : "fulfillments";
    const { error: jobError } = await admin.from("sync_jobs").insert({ shop_id: shop.id, kind });
    if (jobError) throw jobError;

    if (topic.startsWith("orders/") || topic.startsWith("fulfillments/")) {
      let orderGid: string | null = null;
      if (topic.startsWith("orders/") && payload.admin_graphql_api_id) orderGid = String(payload.admin_graphql_api_id);
      else if (topic.startsWith("fulfillments/") && payload.order_id) orderGid = `gid://shopify/Order/${payload.order_id}`;

      if (orderGid) {
        const { ShopifySyncService } = await import("@/services/synchronization/shopify-sync");
        await new ShopifySyncService().syncOrder(shop.id, orderGid);
        
        // Invalidate caches immediately so users see fresh data
        await invalidateOrderCaches(shop.organization_id, shop.id);
      }
    }

    const { error: processedError } = await admin.from("webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: null })
      .eq("id", eventId);
    if (processedError) throw processedError;

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    try {
      const webhookId = request.headers.get("x-shopify-webhook-id");
      const admin = createAdminClient();
      if (webhookId) await admin.from("webhook_events").update({ status: "failed", error: "Webhook processing failed" }).eq("webhook_id", webhookId);
    } catch (markError) {
      console.error("Failed to mark webhook event:", markError);
    }
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPayload, safeShopDomain, verifyWebhook } from "@/lib/security/shopify";
export async function POST(request: NextRequest) {
  const raw = await request.text(); if (!verifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  try {
    const domain = safeShopDomain(request.headers.get("x-shopify-shop-domain") || "");
    const webhookId = request.headers.get("x-shopify-webhook-id");
    const topic = request.headers.get("x-shopify-topic");
    
    if (!webhookId || !topic) return NextResponse.json({ error: "Invalid webhook headers" }, { status: 400 });
    
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const admin = createAdminClient();
    const { data: shop } = await admin.from("shops").select("id,organization_id").eq("shop_domain", domain).maybeSingle();
    
    if (!shop) return new NextResponse(null, { status: 200 });
    
    const { error } = await admin.from("webhook_events").insert({
      webhook_id: webhookId,
      shop_id: shop.id,
      topic,
      api_version: request.headers.get("x-shopify-api-version"),
      payload_hash: hashPayload(raw),
      payload
    });
    
    if (error?.code === "23505") return new NextResponse(null, { status: 200 });
    if (error) throw error;
    
    const kind = topic.startsWith("orders/") ? "orders" : topic.startsWith("products/") ? "products" : "fulfillments";
    await admin.from("sync_jobs").insert({ shop_id: shop.id, kind });

    // Inline processing for critical order/fulfillment topics to ensure MiBx stays completely up to date
    if (topic.startsWith("orders/") || topic.startsWith("fulfillments/")) {
      let orderGid: string | null = null;
      if (topic.startsWith("orders/") && payload.admin_graphql_api_id) {
        orderGid = payload.admin_graphql_api_id as string;
      } else if (topic.startsWith("fulfillments/") && payload.order_id) {
        orderGid = `gid://shopify/Order/${payload.order_id}`;
      }
      
      if (orderGid) {
        const { ShopifySyncService } = await import("@/services/synchronization/shopify-sync");
        const syncService = new ShopifySyncService();
        await syncService.syncOrder(shop.id, orderGid);
      }
    }

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

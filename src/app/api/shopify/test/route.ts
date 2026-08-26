import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphql } from "@/services/shopify/client";
import { serverEnv } from "@/lib/env";

type ShopQuery = {
  shop: {
    id: string;
    name: string;
    email: string;
    plan: { displayName: string };
    ianaTimezone: string;
    currencyCode: string;
  };
};

/**
 * POST /api/shopify/test?shopId=<uuid>
 * Tests the Shopify connection for the given shop and returns safe metadata.
 * The raw access token is never returned.
 */
export async function POST(request: NextRequest) {
  const startMs = Date.now();

  try {
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });

    const { user } = await requireShopPermission(shopId, "manage_shopify");
    const admin = createAdminClient();

    // Run a lightweight Shopify GraphQL query — no secrets in response
    const result = await shopifyGraphql<ShopQuery>(
      shopId,
      `{ shop { id name email plan { displayName } ianaTimezone currencyCode } }`,
      {}
    );

    const latencyMs = Date.now() - startMs;
    const testedAt = new Date().toISOString();
    const env = serverEnv();

    // Update health metadata in shopify_installations
    await admin.from("shopify_installations").update({
      api_version: env.SHOPIFY_API_VERSION,
      last_tested_at: testedAt,
      last_test_status: "connected",
      last_error_message: null
    }).eq("shop_id", shopId);

    // Audit log
    const { data: shop } = await admin
      .from("shops")
      .select("organization_id")
      .eq("id", shopId)
      .single();

    if (shop) {
      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action: "shopify.connection_tested",
        entity_type: "shop",
        entity_id: shopId,
        metadata: { result: "connected", latency_ms: latencyMs }
      });
    }

    return NextResponse.json({
      data: {
        connected: true,
        latencyMs,
        testedAt,
        shopName: result.shop.name,
        apiVersion: env.SHOPIFY_API_VERSION,
        plan: result.shop.plan?.displayName
      }
    });
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const shopId = new URL(request.url).searchParams.get("shopId");

    if (shopId) {
      try {
        const admin = createAdminClient();
        const safeMessage = error instanceof Error
          ? error.message.replace(/token|secret|key|password|authorization/gi, "[REDACTED]")
          : "Connection test failed";

        await admin.from("shopify_installations").update({
          last_tested_at: new Date().toISOString(),
          last_test_status: "auth_error",
          last_error_message: safeMessage
        }).eq("shop_id", shopId);
      } catch {
        // Best-effort health update — don't shadow the original error
      }
    }

    return apiError(error);
  }
}

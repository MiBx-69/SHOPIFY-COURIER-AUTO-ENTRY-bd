import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { apiError, currentUser } from "@/lib/api/auth";
import { encryptSecret } from "@/lib/security/crypto";
import { safeShopDomain, verifyShopifyHmac } from "@/lib/security/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireShopifyEnv } from "@/lib/env";
import { registerShopifyWebhooks } from "@/services/shopify/client";

export async function GET(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const params = request.nextUrl.searchParams;

    const cookieState = request.cookies.get("shopify_oauth_state")?.value;
    const queryState = params.get("state");

    if (queryState !== cookieState || !verifyShopifyHmac(params)) {
      return NextResponse.json({ error: "Invalid Shopify installation request" }, { status: 400 });
    }

    const rawShop = params.get("shop") || "";
    const shopDomain = safeShopDomain(rawShop);
    const code = params.get("code");

    if (!code) {
      return NextResponse.json({ error: "Missing Shopify authorization code" }, { status: 400 });
    }

    const env = requireShopifyEnv();

    // 1. Exchange code for Shopify permanent access token
    const tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: env.SHOPIFY_CLIENT_ID,
        client_secret: env.SHOPIFY_CLIENT_SECRET,
        code
      }),
      signal: AbortSignal.timeout(15_000)
    });

    const tokenResult = (await tokenResponse.json()) as { access_token?: string; scope?: string };
    if (!tokenResponse.ok || !tokenResult.access_token) {
      throw new Error("Shopify did not return an access token");
    }

    // 2. Query basic shop metadata from Shopify GraphQL
    const shopResponse = await fetch(
      `https://${shopDomain}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenResult.access_token
        },
        body: JSON.stringify({ query: "{ shop { id name currencyCode ianaTimezone } }" }),
        signal: AbortSignal.timeout(15_000)
      }
    );

    const shopPayload = (await shopResponse.json()) as {
      data?: { shop?: { id: string; name: string; currencyCode: string; ianaTimezone: string } };
    };
    const remoteShop = shopPayload.data?.shop;
    if (!remoteShop) {
      throw new Error("Unable to identify Shopify store details");
    }

    const admin = createAdminClient();

    // 3. Upsert organization & shop record
    const { data: existing } = await admin
      .from("shops")
      .select("id,organization_id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();

    let shopId: string;
    let organizationId: string;

    if (existing) {
      organizationId = existing.organization_id;
      shopId = existing.id;

      // Ensure current user is a member of this organization
      const { data: membership } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        // Automatically add the user as owner/admin if reconnecting
        await admin.from("memberships").insert({
          organization_id: organizationId,
          user_id: user.id,
          role: "owner"
        });
      }

      await admin
        .from("shops")
        .update({
          name: remoteShop.name,
          currency: remoteShop.currencyCode,
          timezone: remoteShop.ianaTimezone || "Asia/Dhaka",
          connection_status: "healthy",
          updated_at: new Date().toISOString()
        })
        .eq("id", shopId);
    } else {
      const slug = `${remoteShop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 45) || "shop"}-${randomBytes(3).toString("hex")}`;
      
      const { data: org, error: orgError } = await admin
        .from("organizations")
        .insert({ name: remoteShop.name, slug })
        .select()
        .single();

      if (orgError || !org) {
        throw orgError || new Error("Unable to create organization for new store");
      }

      organizationId = org.id;

      await admin.from("memberships").insert({
        organization_id: organizationId,
        user_id: user.id,
        role: "owner"
      });

      const { data: created, error: createError } = await admin
        .from("shops")
        .insert({
          organization_id: organizationId,
          shop_domain: shopDomain,
          shopify_shop_gid: remoteShop.id,
          name: remoteShop.name,
          currency: remoteShop.currencyCode,
          timezone: remoteShop.ianaTimezone || "Asia/Dhaka",
          connection_status: "healthy"
        })
        .select()
        .single();

      if (createError || !created) {
        throw createError || new Error("Unable to create shop record");
      }

      shopId = created.id;
    }

    // 4. Save encrypted installation token
    const encrypted = encryptSecret({ accessToken: tokenResult.access_token });
    await admin.from("shopify_installations").upsert({
      shop_id: shopId,
      access_token_ciphertext: encrypted.ciphertext,
      access_token_iv: encrypted.iv,
      access_token_tag: encrypted.authTag,
      scopes: (tokenResult.scope || "").split(",").filter(Boolean),
      revoked_at: null,
      updated_at: new Date().toISOString()
    });

    // 5. Register webhooks in background (safely non-blocking)
    registerShopifyWebhooks(shopId).catch((err) => {
      console.warn("[SHOPIFY WEBHOOKS] Async registration notice:", err);
    });

    // 6. Queue initial sync job & record audit log safely
    try {
      await admin.from("sync_jobs").insert({
        shop_id: shopId,
        kind: "initial",
        created_by: user.id
      });
    } catch (err) {
      console.warn("[SYNC JOB] Could not insert initial sync job:", err);
    }

    try {
      await admin.from("audit_logs").insert({
        organization_id: organizationId,
        shop_id: shopId,
        actor_id: user.id,
        action: "shopify.connected",
        entity_type: "shop",
        entity_id: shopId
      });
    } catch (err) {
      console.warn("[AUDIT LOG] Could not record connection audit log:", err);
    }

    // 7. Clean up state cookie and redirect to orders dashboard
    const baseUrl = (env.SHOPIFY_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const response = NextResponse.redirect(new URL(`/orders?shop=${shopId}`, baseUrl));
    response.cookies.delete("shopify_oauth_state");
    return response;
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { currentUser, apiError } from "@/lib/api/auth";
import { safeShopDomain } from "@/lib/security/shopify";
import { requireShopifyEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  try {
    await currentUser();
    const rawShop = request.nextUrl.searchParams.get("shop") || "";
    const shop = safeShopDomain(rawShop);
    const state = crypto.randomUUID();
    const env = requireShopifyEnv();

    const appUrl = (env.SHOPIFY_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    const authorization = new URL(`https://${shop}/admin/oauth/authorize`);
    authorization.searchParams.set("client_id", env.SHOPIFY_CLIENT_ID);
    authorization.searchParams.set("scope", env.SHOPIFY_SCOPES);
    authorization.searchParams.set("redirect_uri", `${appUrl}/api/shopify/callback`);
    authorization.searchParams.set("state", state);

    const response = NextResponse.redirect(authorization);
    response.cookies.set("shopify_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/"
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}

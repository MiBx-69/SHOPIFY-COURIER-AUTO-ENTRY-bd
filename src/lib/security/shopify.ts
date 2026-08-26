import crypto from "node:crypto";
import { requireShopifyEnv } from "@/lib/env";

export function safeShopDomain(value: string) {
  const shop = value.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/.test(shop)) throw new Error("Invalid Shopify shop domain");
  return shop;
}
export function verifyShopifyHmac(params: URLSearchParams) {
  const supplied = params.get("hmac");
  if (!supplied) return false;
  const message = [...params.entries()].filter(([key]) => key !== "hmac" && key !== "signature").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  const digest = crypto.createHmac("sha256", requireShopifyEnv().SHOPIFY_CLIENT_SECRET).update(message).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(supplied));
}
export function verifyWebhook(rawBody: string, hmac: string | null) {
  if (!hmac) return false;
  const digest = crypto.createHmac("sha256", requireShopifyEnv().SHOPIFY_CLIENT_SECRET).update(rawBody, "utf8").digest("base64");
  return digest.length === hmac.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}
export function hashPayload(rawBody: string) { return crypto.createHash("sha256").update(rawBody).digest("hex"); }

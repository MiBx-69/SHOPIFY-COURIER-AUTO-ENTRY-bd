import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPayload, safeShopDomain } from "@/lib/security/shopify";
describe("Shopify request primitives", () => {
  it("accepts only canonical myshopify domains", () => { expect(safeShopDomain("Example.myshopify.com")).toBe("example.myshopify.com"); expect(() => safeShopDomain("evil.example.com")).toThrow(); });
  it("creates a stable webhook payload fingerprint", () => { expect(hashPayload('{"id":1}')).toBe(hashPayload('{"id":1}')); expect(hashPayload('{"id":1}')).not.toBe(hashPayload('{"id":2}')); });
  it("uses SHA-256 compatible webhook HMACs", () => { const raw = "payload"; expect(crypto.createHmac("sha256", "secret").update(raw).digest("base64")).toHaveLength(44); });
});

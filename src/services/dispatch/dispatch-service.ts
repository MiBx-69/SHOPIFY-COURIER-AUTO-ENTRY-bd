import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";
import { selectCourier } from "@/services/courier/selector";
import { updateShopifyDispatchMetafields, createShopifyFulfillment } from "@/services/shopify/client";
import type { NormalizedShipment } from "@/types/domain";

function address(value: Record<string, string>) { return [value.address1, value.address2, value.area, value.city, value.province, value.zip, value.country].filter(Boolean).join(", "); }
export class DispatchService {
  async execute(dispatchId: string, requestedConfigId?: string) {
    const admin = createAdminClient();
    const { data: dispatch, error } = await admin.from("dispatches").select("*,orders(*,order_line_items(*))").eq("id", dispatchId).single();
    if (error || !dispatch) throw new Error("Dispatch not found");
    if (dispatch.status === "dispatched") return dispatch;
    const order = dispatch.orders as Record<string, unknown>;
    if (!order.customer_phone || !order.shipping_address || order.cancelled_at) return this.fail(dispatch, "Order is not eligible for dispatch");
    const { data: configs } = await admin.from("courier_configs").select("id,priority,enabled,connection_status,couriers(provider)").eq("shop_id", dispatch.shop_id);
    const candidates = (configs || []).map((item) => ({ ...item, provider: (item.couriers as unknown as { provider: "redx"|"pathao"|"steadfast" }).provider }));
    const selected = selectCourier(candidates, requestedConfigId);
    const { data: secret, error: secretError } = await admin.from("courier_secrets").select("ciphertext,iv,auth_tag").eq("courier_config_id", selected.id).single();
    if (secretError || !secret) return this.fail(dispatch, "Courier credentials are unavailable");
    const credentials = decryptSecret({ ciphertext: secret.ciphertext, iv: secret.iv, authTag: secret.auth_tag });
    const items = order.order_line_items as Array<Record<string, unknown>>;
    const payload: NormalizedShipment = { orderId: String(order.id), orderNumber: String(order.order_number), customerName: String(order.customer_name || ""), phone: String(order.customer_phone), email: order.customer_email ? String(order.customer_email) : undefined, fullAddress: address(order.shipping_address as Record<string,string>), city: (order.shipping_address as Record<string,string>).city, area: (order.shipping_address as Record<string,string>).area, postalCode: (order.shipping_address as Record<string,string>).zip, codAmount: Number(order.total_minor) / 100, notes: order.note ? String(order.note) : undefined, items: items.map((item) => ({ productName: String(item.title), variant: item.variant_title ? String(item.variant_title) : undefined, sku: item.sku ? String(item.sku) : undefined, quantity: Number(item.quantity), price: Number(item.unit_price_minor) / 100 })) };
    const provider = courierRegistry.get(selected.provider);
    const attempt = await admin.from("dispatch_attempts").insert({ dispatch_id: dispatch.id, shop_id: dispatch.shop_id, provider: selected.provider, idempotency_key: dispatch.idempotency_key, status: "started" }).select().single();
    const result = await provider.createShipment(payload, credentials, dispatch.idempotency_key);
    if (result.outcome !== "success") {
      await admin.from("dispatch_attempts").update({ status: result.outcome, completed_at: new Date().toISOString(), error_code: result.code, safe_error_message: result.message, response_metadata: result.metadata || {} }).eq("id", attempt.data?.id);
      if (result.outcome === "unknown") return admin.from("dispatches").update({ phase: "unknown", safe_error_message: "Courier outcome is unknown; reconcile before retrying." }).eq("id", dispatch.id).select().single();
      return this.fail(dispatch, result.message);
    }
    await admin.from("dispatch_attempts").update({ status: "success", completed_at: new Date().toISOString(), external_reference: result.courierReference, response_metadata: result.metadata || {} }).eq("id", attempt.data?.id);
    await admin.from("courier_shipments").insert({ dispatch_id: dispatch.id, shop_id: dispatch.shop_id, provider: selected.provider, tracking_id: result.trackingId, courier_reference: result.courierReference, status: "created" });
    await admin.from("dispatches").update({ courier_config_id: selected.id, status: "dispatched", phase: "courier_created", tracking_id: result.trackingId, courier_reference: result.courierReference, courier_status: "created", dispatched_at: new Date().toISOString() }).eq("id", dispatch.id);
    await admin.from("orders").update({ dispatch_status: "dispatched" }).eq("id", dispatch.order_id);
    try { 
      await updateShopifyDispatchMetafields(dispatch.shop_id, String(order.shopify_order_gid), { courier: selected.provider, trackingId: result.trackingId, reference: result.courierReference, dispatchedAt: new Date().toISOString() }); 
      await createShopifyFulfillment(dispatch.shop_id, String(order.shopify_order_gid), { company: selected.provider, number: result.trackingId });
      await admin.from("dispatches").update({ phase: "completed", shopify_updated_at: new Date().toISOString() }).eq("id", dispatch.id); 
    } catch { 
      await admin.from("dispatches").update({ phase: "shopify_update_pending", safe_error_message: "Courier shipment created; Shopify update requires attention." }).eq("id", dispatch.id); 
    }
    return admin.from("dispatches").select().eq("id", dispatch.id).single();
  }
  private async fail(dispatch: { id: string; order_id: string }, message: string) { const admin = createAdminClient(); await admin.from("dispatches").update({ status: "failed", phase: "failed", safe_error_message: message }).eq("id", dispatch.id); await admin.from("orders").update({ dispatch_status: "failed" }).eq("id", dispatch.order_id); return admin.from("dispatches").select().eq("id", dispatch.id).single(); }
}

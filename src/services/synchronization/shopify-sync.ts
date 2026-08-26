import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphql } from "@/services/shopify/client";

type ShopifyOrder = { id: string; legacyResourceId: string; orderNumber: number; name: string; email: string | null; phone: string | null; displayFinancialStatus: string; displayFulfillmentStatus: string; cancelledAt: string | null; closedAt: string | null; createdAt: string; updatedAt: string; note: string | null; currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } }; currentTotalDiscountsSet: { shopMoney: { amount: string } }; currentShippingPriceSet: { shopMoney: { amount: string } }; currentTotalTaxSet: { shopMoney: { amount: string } }; currentTotalPriceSet: { shopMoney: { amount: string } }; shippingAddress: Record<string,string> | null; billingAddress: Record<string,string> | null; customer: { displayName: string; email: string | null; phone: string | null } | null; lineItems: { nodes: Array<{ id: string; title: string; variantTitle: string | null; sku: string | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } }; originalTotalSet: { shopMoney: { amount: string } }; product: { id: string } | null; variant: { id: string } | null }> } };
const minor = (amount: string) => Math.round(Number(amount) * 100);
const orderFragment = `id legacyResourceId orderNumber name email phone displayFinancialStatus displayFulfillmentStatus cancelledAt closedAt createdAt updatedAt note currentSubtotalPriceSet { shopMoney { amount currencyCode } } currentTotalDiscountsSet { shopMoney { amount } } currentShippingPriceSet { shopMoney { amount } } currentTotalTaxSet { shopMoney { amount } } currentTotalPriceSet { shopMoney { amount } } shippingAddress { name address1 address2 city province zip country phone } billingAddress { name address1 address2 city province zip country phone } customer { displayName email phone } lineItems(first:250) { nodes { id title variantTitle sku quantity originalUnitPriceSet { shopMoney { amount } } originalTotalSet { shopMoney { amount } } product { id } variant { id } } }`;

export class ShopifySyncService {
  async initialSync(shopId: string) { return this.syncOrders(shopId); }
  async syncOrders(shopId: string, query = "updated_at:>=2020-01-01") {
    const admin = createAdminClient();
    const result = await shopifyGraphql<{ orders: { nodes: ShopifyOrder[] } }>(shopId, `query Orders($query:String!) { orders(first:250, query:$query, sortKey:UPDATED_AT, reverse:true) { nodes { ${orderFragment} } } }`, { query });
    for (const order of result.orders.nodes) await this.upsertOrder(shopId, order);
    await admin.from("shops").update({ last_synced_at: new Date().toISOString(), connection_status: "healthy" }).eq("id", shopId);
    return result.orders.nodes.length;
  }
  async syncOrder(shopId: string, gid: string) {
    const data = await shopifyGraphql<{ order: ShopifyOrder | null }>(shopId, `query Order($id:ID!) { order(id:$id) { ${orderFragment} } }`, { id: gid });
    if (data.order) await this.upsertOrder(shopId, data.order);
  }
  async syncProducts(_shopId: string) { /* Historical order snapshots intentionally eliminate product lookup dependency. */ }
  async syncFulfillment(shopId: string, gid: string) { await this.syncOrder(shopId, gid); }
  async reconcile(shopId: string) { return this.syncOrders(shopId, `updated_at:>=${new Date(Date.now() - 48 * 3600_000).toISOString().slice(0,10)}`); }
  private async upsertOrder(shopId: string, source: ShopifyOrder) {
    const admin = createAdminClient();
    const row = { shop_id: shopId, shopify_order_id: source.legacyResourceId, shopify_order_gid: source.id, order_number: source.orderNumber, name: source.name, customer_name: source.customer?.displayName || source.shippingAddress?.name || null, customer_email: source.customer?.email || source.email, customer_phone: source.shippingAddress?.phone || source.customer?.phone || source.phone, shipping_address: source.shippingAddress || {}, billing_address: source.billingAddress || {}, note: source.note, subtotal_minor: minor(source.currentSubtotalPriceSet.shopMoney.amount), discount_minor: minor(source.currentTotalDiscountsSet.shopMoney.amount), shipping_minor: minor(source.currentShippingPriceSet.shopMoney.amount), tax_minor: minor(source.currentTotalTaxSet.shopMoney.amount), total_minor: minor(source.currentTotalPriceSet.shopMoney.amount), currency: source.currentSubtotalPriceSet.shopMoney.currencyCode, financial_status: source.displayFinancialStatus, fulfillment_status: source.displayFulfillmentStatus, cancelled_at: source.cancelledAt, closed_at: source.closedAt, shopify_created_at: source.createdAt, shopify_updated_at: source.updatedAt };
    const { data: existing } = await admin.from("orders").select("id,dispatch_status").eq("shop_id", shopId).eq("shopify_order_id", source.legacyResourceId).maybeSingle();
    const { data: order, error } = await admin.from("orders").upsert({ ...row, changed_after_dispatch: existing?.dispatch_status === "dispatched" }, { onConflict: "shop_id,shopify_order_id" }).select("id").single();
    if (error || !order) throw new Error("Unable to store Shopify order");
    await admin.from("order_line_items").delete().eq("order_id", order.id);
    if (source.lineItems.nodes.length) await admin.from("order_line_items").insert(source.lineItems.nodes.map((item) => ({ shop_id: shopId, order_id: order.id, shopify_line_item_id: item.id, product_id: item.product?.id, variant_id: item.variant?.id, title: item.title, variant_title: item.variantTitle, sku: item.sku, quantity: item.quantity, unit_price_minor: minor(item.originalUnitPriceSet.shopMoney.amount), total_price_minor: minor(item.originalTotalSet.shopMoney.amount), product_snapshot: item })));
  }
}

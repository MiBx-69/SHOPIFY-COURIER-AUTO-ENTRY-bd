import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { serverEnv } from "@/lib/env";

export async function shopifyGraphql<T>(shopId: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const admin = createAdminClient();
  const { data: shop, error: shopError } = await admin.from("shops").select("shop_domain").eq("id", shopId).single();
  if (shopError || !shop) throw new Error("Shop connection not found");
  const { data: installation, error } = await admin.from("shopify_installations").select("access_token_ciphertext,access_token_iv,access_token_tag").eq("shop_id", shopId).single();
  if (error || !installation) throw new Error("Shopify is not connected");
  const token = decryptSecret({ ciphertext: installation.access_token_ciphertext, iv: installation.access_token_iv, authTag: installation.access_token_tag }).accessToken;
  
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    attempts++;
    const response = await fetch(`https://${shop.shop_domain}/admin/api/${serverEnv().SHOPIFY_API_VERSION}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000) });
    
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempts) * 1000;
      console.warn(`Shopify Rate Limit (429) hit. Retrying in ${delayMs}ms (Attempt ${attempts} of ${maxAttempts})`);
      if (attempts >= maxAttempts) throw new Error("Shopify API rate limit exceeded");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    
    if (!response.ok) throw new Error(`Shopify request failed (${response.status})`);
    
    const result = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (result.errors?.length) {
      const isThrottled = result.errors.some(e => e.message.toLowerCase().includes("throttle"));
      if (isThrottled && attempts < maxAttempts) {
        const delayMs = Math.pow(2, attempts) * 1000;
        console.warn(`Shopify GraphQL Throttle hit. Retrying in ${delayMs}ms (Attempt ${attempts} of ${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      
      const isFulfillmentAccessDenied = result.errors.some(e => e.message.includes("Access denied for fulfillmentOrders"));
      if (isFulfillmentAccessDenied && result.data) {
        console.warn("Shopify returned Access Denied for fulfillmentOrders. Please re-authenticate the app to grant merchant_managed_fulfillment_orders and third_party_fulfillment_orders scopes.");
        return result.data; // Return the rest of the data
      }

      throw new Error(result.errors[0]?.message || "Shopify returned no data");
    }
    if (!result.data) throw new Error("Shopify returned no data");
    return result.data;
  }
  throw new Error("Shopify request failed after retries");
}

export async function updateShopifyDispatchMetafields(shopId: string, orderGid: string, dispatch: { courier: string; trackingId: string; reference?: string; dispatchedAt: string }) {
  const result = await shopifyGraphql<{ metafieldsSet: { userErrors: Array<{ message: string }> } }>(shopId, `mutation SetDispatch($metafields:[MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields) { userErrors { message } } }`, { metafields: [
    ["courier", dispatch.courier], ["tracking_id", dispatch.trackingId], ["courier_reference", dispatch.reference || ""], ["dispatch_status", "dispatched"], ["dispatched_at", dispatch.dispatchedAt]
  ].map(([key, value]) => ({ ownerId: orderGid, namespace: "dispatch", key, type: "single_line_text_field", value })) });
  if (result.metafieldsSet.userErrors.length) throw new Error(result.metafieldsSet.userErrors[0].message);
}

export async function createShopifyFulfillment(shopId: string, orderGid: string, trackingInfo: { company: string; number: string; url?: string }) {
  // First, fetch the fulfillment order IDs for the given order
  const orderData = await shopifyGraphql<{ order: { fulfillmentOrders: { nodes: Array<{ id: string, status: string }> } } }>(
    shopId,
    `query getFulfillmentOrders($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`,
    { id: orderGid }
  );

  const openFulfillmentOrders = orderData.order.fulfillmentOrders.nodes.filter(fo => fo.status === "OPEN" || fo.status === "IN_PROGRESS");
  if (openFulfillmentOrders.length === 0) {
    return; // Nothing to fulfill
  }

  // Create fulfillment for the first open fulfillment order
  const fulfillmentOrderId = openFulfillmentOrders[0].id;
  const result = await shopifyGraphql<{ fulfillmentCreateV2: { userErrors: Array<{ message: string }> } }>(
    shopId,
    `mutation fulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
      fulfillmentCreateV2(fulfillment: $fulfillment) {
        userErrors { message }
      }
    }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder: [{ fulfillmentOrderId }],
        notifyCustomer: true,
        trackingInfo: {
          company: trackingInfo.company,
          number: trackingInfo.number,
          url: trackingInfo.url || ""
        }
      }
    }
  );

  if (result.fulfillmentCreateV2?.userErrors?.length) {
    throw new Error(result.fulfillmentCreateV2.userErrors[0].message);
  }
}

export async function registerShopifyWebhooks(shopId: string) {
  const appUrl = (serverEnv().SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  const callback = `${appUrl}/api/webhooks/shopify`;
  const topics = [
    "ORDERS_CREATE",
    "ORDERS_UPDATED",
    "ORDERS_CANCELLED",
    "ORDERS_FULFILLED",
    "FULFILLMENTS_CREATE",
    "FULFILLMENTS_UPDATE",
    "PRODUCTS_UPDATE",
    "PRODUCTS_DELETE",
    "APP_UNINSTALLED"
  ];

  await Promise.allSettled(
    topics.map(async (topic) => {
      try {
        const data = await shopifyGraphql<{
          webhookSubscriptionCreate: {
            userErrors: Array<{ message: string; field?: string[] }>;
          };
        }>(
          shopId,
          `mutation Subscribe($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
              userErrors {
                message
                field
              }
            }
          }`,
          { topic, input: { uri: callback } }
        );

        if (data.webhookSubscriptionCreate?.userErrors?.length) {
          const errMsg = data.webhookSubscriptionCreate.userErrors[0].message;
          if (
            errMsg.toLowerCase().includes("taken") ||
            errMsg.toLowerCase().includes("already") ||
            errMsg.toLowerCase().includes("exists")
          ) {
            console.info(`[WEBHOOK REGISTER] Topic ${topic} is already registered on Shopify.`);
            return;
          }
          console.warn(`[WEBHOOK REGISTER] Topic ${topic} returned user error:`, errMsg);
        } else {
          console.info(`[WEBHOOK REGISTER] Topic ${topic} registered successfully.`);
        }
      } catch (err) {
        console.warn(`[WEBHOOK REGISTER] Non-fatal error registering topic ${topic}:`, err instanceof Error ? err.message : err);
      }
    })
  );
}

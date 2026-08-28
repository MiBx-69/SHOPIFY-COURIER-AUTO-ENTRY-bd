import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { serverEnv } from "@/lib/env";

async function inspectShopifyResponse() {
  const shopId = "2c0a237b-815e-4c32-981b-ba0a038fe1ff";
  const admin = createAdminClient();
  const { data: shop } = await admin.from("shops").select("shop_domain").eq("id", shopId).single();
  const { data: installation } = await admin.from("shopify_installations").select("access_token_ciphertext,access_token_iv,access_token_tag").eq("shop_id", shopId).single();

  if (!installation || !shop) {
    console.error("Installation or shop missing!");
    return;
  }

  const token = decryptSecret({
    ciphertext: installation.access_token_ciphertext,
    iv: installation.access_token_iv,
    authTag: installation.access_token_tag
  }).accessToken;

  console.log("Got token for shop:", shop.shop_domain);

  const query = `query Orders {
    orders(first: 5, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        name
        displayFulfillmentStatus
        displayFinancialStatus
        fulfillmentOrders(first: 5) {
          nodes {
            id
            status
          }
        }
      }
    }
  }`;

  const res = await fetch(`https://${shop.shop_domain}/admin/api/${serverEnv().SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query })
  });

  const json = await res.json();
  console.log("HTTP status:", res.status);
  console.log("Raw JSON:", JSON.stringify(json, null, 2));
}

inspectShopifyResponse();

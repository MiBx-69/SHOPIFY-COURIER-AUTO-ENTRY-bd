import { getOfflineAccessToken } from "@/services/shopify/session";

async function checkRawResponse() {
  const shopId = "2c0a237b-815e-4c32-981b-ba0a038fe1ff";
  const { session, shop } = await getOfflineAccessToken(shopId);
  console.log("Got session for shop domain:", session.shop);

  const res = await fetch(`https://${session.shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": session.accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `query Orders {
        orders(first: 10, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            name
            displayFulfillmentStatus
            displayFinancialStatus
            fulfillmentOrders(first: 5) {
              nodes {
                id
                status
                fulfillmentHolds {
                  reason
                }
              }
            }
          }
        }
      }`
    })
  });

  const json = await res.json();
  console.log("Raw status:", res.status);
  console.log("Errors array:", JSON.stringify(json.errors, null, 2));
  console.log("Data nodes:", JSON.stringify(json.data?.orders?.nodes?.slice(0, 4), null, 2));
}

checkRawResponse();

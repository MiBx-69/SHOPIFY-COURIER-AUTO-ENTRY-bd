import { describe, it, expect } from "vitest";
import { resolveFulfillmentStatus, type ShopifyOrder } from "./shopify-sync";

function mockOrder(partial: Partial<ShopifyOrder>): ShopifyOrder {
  return {
    id: "gid://shopify/Order/123",
    legacyResourceId: "123",
    name: "#1001",
    email: "test@example.com",
    phone: "+8801711111111",
    displayFinancialStatus: "PENDING",
    displayFulfillmentStatus: "UNFULFILLED",
    cancelledAt: null,
    closedAt: null,
    createdAt: "2026-08-28T00:00:00Z",
    updatedAt: "2026-08-28T00:00:00Z",
    note: null,
    currentSubtotalPriceSet: { shopMoney: { amount: "1000.00", currencyCode: "BDT" } },
    currentTotalDiscountsSet: { shopMoney: { amount: "0.00" } },
    currentShippingPriceSet: { shopMoney: { amount: "60.00" } },
    currentTotalTaxSet: { shopMoney: { amount: "0.00" } },
    currentTotalPriceSet: { shopMoney: { amount: "1060.00", currencyCode: "BDT" } },
    shippingAddress: { city: "Dhaka", address1: "Dhanmondi" },
    billingAddress: null,
    lineItems: { nodes: [] },
    ...partial
  };
}

describe("resolveFulfillmentStatus", () => {
  it("resolves ON_HOLD from displayFulfillmentStatus", () => {
    const order = mockOrder({ displayFulfillmentStatus: "ON_HOLD" });
    expect(resolveFulfillmentStatus(order)).toBe("ON_HOLD");
  });

  it("resolves ON_HOLD when fulfillment order has status ON_HOLD", () => {
    const order = mockOrder({
      displayFulfillmentStatus: "UNFULFILLED",
      fulfillmentOrders: {
        nodes: [{ id: "fo-1", status: "ON_HOLD" }]
      }
    });
    expect(resolveFulfillmentStatus(order)).toBe("ON_HOLD");
  });

  it("resolves ON_HOLD when fulfillment order has active fulfillmentHolds", () => {
    const order = mockOrder({
      displayFulfillmentStatus: "UNFULFILLED",
      fulfillmentOrders: {
        nodes: [
          {
            id: "fo-1",
            status: "OPEN",
            fulfillmentHolds: [{ reason: "Awaiting payment verification", reasonNotes: "Manual hold" }]
          }
        ]
      }
    });
    expect(resolveFulfillmentStatus(order)).toBe("ON_HOLD");
  });

  it("resolves IN_PROGRESS when order is in progress", () => {
    const order = mockOrder({ displayFulfillmentStatus: "IN_PROGRESS" });
    expect(resolveFulfillmentStatus(order)).toBe("IN_PROGRESS");
  });

  it("resolves IN_PROGRESS when fulfillment order has status IN_PROGRESS", () => {
    const order = mockOrder({
      displayFulfillmentStatus: "UNFULFILLED",
      fulfillmentOrders: {
        nodes: [{ id: "fo-1", status: "IN_PROGRESS" }]
      }
    });
    expect(resolveFulfillmentStatus(order)).toBe("IN_PROGRESS");
  });

  it("resolves FULFILLED", () => {
    const order = mockOrder({ displayFulfillmentStatus: "FULFILLED" });
    expect(resolveFulfillmentStatus(order)).toBe("FULFILLED");
  });

  it("resolves CANCELLED when cancelledAt is set or financial status is VOIDED", () => {
    const order1 = mockOrder({ cancelledAt: "2026-08-28T00:00:00Z" });
    expect(resolveFulfillmentStatus(order1)).toBe("CANCELLED");

    const order2 = mockOrder({ displayFinancialStatus: "VOIDED" });
    expect(resolveFulfillmentStatus(order2)).toBe("CANCELLED");
  });

  it("defaults to UNFULFILLED for active regular orders", () => {
    const order = mockOrder({
      displayFulfillmentStatus: "UNFULFILLED",
      fulfillmentOrders: {
        nodes: [{ id: "fo-1", status: "OPEN" }]
      }
    });
    expect(resolveFulfillmentStatus(order)).toBe("UNFULFILLED");
  });
});

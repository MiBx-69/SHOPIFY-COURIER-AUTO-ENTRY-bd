import { afterEach, describe, expect, it, vi } from "vitest";
import { SteadfastProvider, RedxProvider, PathaoProvider } from "@/services/courier/providers";

const payload = {
  orderId: "o",
  orderNumber: "1001",
  customerName: "A",
  phone: "01700000000",
  fullAddress: "Dhaka",
  codAmount: 100,
  items: [{ productName: "P", quantity: 1, price: 100 }]
};

describe("Steadfast provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes a definitive success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ tracking_code: "TRACK-1", consignment_id: "C-1" }), { status: 200 })
      )
    );
    const result = await new SteadfastProvider().createShipment(
      payload,
      { apiKey: "key", secretKey: "secret", baseUrl: "https://courier.test" },
      "request-key"
    );
    expect(result).toMatchObject({ outcome: "success", trackingId: "TRACK-1" });
  });

  it("marks server failure as unknown instead of retrying", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    const result = await new SteadfastProvider().createShipment(
      payload,
      { apiKey: "key", secretKey: "secret", baseUrl: "https://courier.test" },
      "request-key"
    );
    expect(result.outcome).toBe("unknown");
  });

  it("returns registered primary pickup location", async () => {
    const provider = new SteadfastProvider();
    const locations = await provider.getPickupLocations({
      apiKey: "key",
      secretKey: "secret",
      baseUrl: "https://courier.test",
      senderName: "My Merchant",
      pickupAddress: "Mirpur, Dhaka"
    });
    expect(locations.length).toBeGreaterThan(0);
    expect(locations[0].name).toBe("My Merchant Warehouse");
    expect(locations[0].address).toBe("Mirpur, Dhaka");
  });
});

describe("Redx provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tests connection against areas endpoint with Bearer token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ areas: [{ id: 1, name: "Uttara" }] }), { status: 200 })
      )
    );
    const provider = new RedxProvider();
    await expect(provider.testConnection({ apiToken: "test-token" })).resolves.toBeUndefined();
  });

  it("fetches pickup stores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            pickup_stores: [
              { id: 16376, name: "Uttara Hub", address: "Sector 10", phone: "01700000000" }
            ]
          }),
          { status: 200 }
        )
      )
    );
    const provider = new RedxProvider();
    const locs = await provider.getPickupLocations({ apiToken: "test-token" });
    expect(locs.length).toBe(1);
    expect(locs[0].courierLocationId).toBe("16376");
    expect(locs[0].name).toBe("Uttara Hub");
  });
});

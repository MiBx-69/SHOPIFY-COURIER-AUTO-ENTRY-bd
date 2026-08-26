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

describe("Pathao provider pickup locations", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches and normalizes Pathao stores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                data: [
                  {
                    store_id: 456,
                    store_name: "Uttara Hub",
                    store_address: "Uttara, Dhaka",
                    is_active: 1
                  }
                ]
              }
            }),
            { status: 200 }
          )
        )
    );

    const provider = new PathaoProvider();
    const locations = await provider.getPickupLocations({
      clientId: "cid",
      clientSecret: "csec",
      username: "user",
      password: "pwd",
      baseUrl: "https://courier.test"
    });

    expect(locations.length).toBe(1);
    expect(locations[0].courierLocationId).toBe("456");
    expect(locations[0].name).toBe("Uttara Hub");
  });
});

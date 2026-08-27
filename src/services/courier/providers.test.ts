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
    const provider = new RedxProvider();
    const locs = await provider.getPickupLocations({ apiToken: "test-token" });
    expect(locs[0].name).toBe("Main Warehouse");
  });
});

describe("Pathao provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("handles validation error and extracts details from errors object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "mock-token" }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              message: "Request payload contains validation errors",
              errors: {
                recipient_phone: ["The recipient phone format is invalid."]
              }
            }),
            { status: 422 }
          )
        )
    );

    const provider = new PathaoProvider();
    const result = await provider.createShipment(
      {
        ...payload,
        phone: "01712345678",
        fullAddress: "House 12, Road 4, Dhanmondi, Dhaka",
        pickupLocationId: "12345"
      },
      {
        clientId: "cid",
        clientSecret: "csec",
        username: "user",
        password: "pwd",
        storeId: "12345"
      },
      "key-1"
    );

    expect(result.outcome).toBe("known_failure");
    if (result.outcome === "known_failure") {
      expect(result.message).toContain("recipient_phone");
      expect(result.message).toContain("The recipient phone format is invalid.");
    }
  });

  it("normalizes international BD phone number +88017... to 11-digit local format", async () => {
    let capturedBody: any = null;
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: "mock-token" }), { status: 200 })
        )
        .mockImplementationOnce((_url, opts: any) => {
          capturedBody = JSON.parse(opts.body);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: { consignment_id: "CONS-999", order_id: "ORD-999" }
              }),
              { status: 200 }
            )
          );
        })
    );

    const provider = new PathaoProvider();
    const result = await provider.createShipment(
      {
        ...payload,
        phone: "+8801712345678",
        fullAddress: "House 12, Road 4, Dhanmondi, Dhaka",
        pickupLocationId: "12345"
      },
      {
        clientId: "cid",
        clientSecret: "csec",
        username: "user",
        password: "pwd",
        storeId: "12345"
      },
      "key-2"
    );

    expect(result.outcome).toBe("success");
    expect(capturedBody.recipient_phone).toBe("01712345678");
  });
});


import { describe, it, expect } from "vitest";
import { 
  detectShippingZone, 
  resolveCourierForOrder, 
  type ShippingRoutingRule, 
  type CourierCandidateInfo 
} from "./routing";

describe("detectShippingZone", () => {
  it("detects Inside Dhaka from city or area", () => {
    const res1 = detectShippingZone({ city: "Dhaka", address1: "House 12, Road 5, Dhanmondi" });
    expect(res1.zone).toBe("inside_dhaka");
    expect(res1.label).toBe("Inside Dhaka");

    const res2 = detectShippingZone({ city: "Dhaka", area: "Mirpur 10", address1: "Block C" });
    expect(res2.zone).toBe("inside_dhaka");

    const res3 = detectShippingZone({ city: "Dhaka", address1: "Uttara Sector 4" });
    expect(res3.zone).toBe("inside_dhaka");
  });

  it("detects Outside Dhaka for other districts", () => {
    const res1 = detectShippingZone({ city: "Chittagong", province: "Chittagong", address1: "GEC Circle" });
    expect(res1.zone).toBe("outside_dhaka");
    expect(res1.label).toBe("Outside Dhaka");

    const res2 = detectShippingZone({ city: "Sylhet", address1: "Zindabazar" });
    expect(res2.zone).toBe("outside_dhaka");

    const res3 = detectShippingZone({ city: "Rajshahi", address1: "Shaheb Bazar" });
    expect(res3.zone).toBe("outside_dhaka");
  });

  it("prioritizes explicit shipping method title", () => {
    const res1 = detectShippingZone({ city: "Dhaka" }, "Outside Dhaka Delivery (130 BDT)");
    expect(res1.zone).toBe("outside_dhaka");

    const res2 = detectShippingZone({ city: "Chittagong" }, "Inside Dhaka Special Rate");
    expect(res2.zone).toBe("inside_dhaka");
  });
});

describe("resolveCourierForOrder", () => {
  const candidates: CourierCandidateInfo[] = [
    {
      id: "cfg_redx_1",
      provider: "redx",
      displayName: "REDX Express",
      enabled: true,
      priority: 1,
      connectionStatus: "connected"
    },
    {
      id: "cfg_pathao_2",
      provider: "pathao",
      displayName: "Pathao Courier",
      enabled: true,
      priority: 2,
      connectionStatus: "connected"
    },
    {
      id: "cfg_steadfast_3",
      provider: "steadfast",
      displayName: "Steadfast Courier",
      enabled: true,
      priority: 3,
      connectionStatus: "connected"
    }
  ];

  const rules: ShippingRoutingRule[] = [
    {
      id: "rule_inside",
      name: "Inside Dhaka -> REDX",
      zoneType: "inside_dhaka",
      courierConfigId: "cfg_redx_1",
      pickupLocationId: "loc_dhaka_hub",
      enabled: true,
      priority: 1
    },
    {
      id: "rule_outside",
      name: "Outside Dhaka -> Pathao",
      zoneType: "outside_dhaka",
      courierConfigId: "cfg_pathao_2",
      pickupLocationId: "loc_outside_hub",
      enabled: true,
      priority: 2
    },
    {
      id: "rule_express",
      name: "Express Method -> Steadfast",
      zoneType: "custom_method",
      methodPattern: "express",
      courierConfigId: "cfg_steadfast_3",
      enabled: true,
      priority: 0 // higher priority
    }
  ];

  it("routes Inside Dhaka orders to REDX", () => {
    const order = {
      shipping_address: { city: "Dhaka", area: "Gulshan 1" },
      shipping_title: "Standard Inside Dhaka"
    };

    const res = resolveCourierForOrder(order, rules, candidates);
    expect(res).not.toBeNull();
    expect(res?.provider).toBe("redx");
    expect(res?.courierConfigId).toBe("cfg_redx_1");
    expect(res?.pickupLocationId).toBe("loc_dhaka_hub");
    expect(res?.zone).toBe("inside_dhaka");
  });

  it("routes Outside Dhaka orders to Pathao", () => {
    const order = {
      shipping_address: { city: "Sylhet", address1: "Amberkhana" },
      shipping_title: "Outside Dhaka Shipping"
    };

    const res = resolveCourierForOrder(order, rules, candidates);
    expect(res).not.toBeNull();
    expect(res?.provider).toBe("pathao");
    expect(res?.courierConfigId).toBe("cfg_pathao_2");
    expect(res?.pickupLocationId).toBe("loc_outside_hub");
    expect(res?.zone).toBe("outside_dhaka");
  });

  it("routes custom method pattern (Express) to Steadfast", () => {
    const order = {
      shipping_address: { city: "Dhaka", area: "Dhanmondi" },
      shipping_title: "Express 24h Delivery"
    };

    const res = resolveCourierForOrder(order, rules, candidates);
    expect(res).not.toBeNull();
    expect(res?.provider).toBe("steadfast");
    expect(res?.courierConfigId).toBe("cfg_steadfast_3");
  });
});

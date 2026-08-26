import { describe, expect, it } from "vitest";
import { selectCourier } from "@/services/courier/selector";
const candidates = [{ id: "a", provider: "pathao" as const, priority: 2, enabled: true, connection_status: "connected" }, { id: "b", provider: "redx" as const, priority: 1, enabled: true, connection_status: "connected" }, { id: "c", provider: "steadfast" as const, priority: 3, enabled: false, connection_status: "connected" }];
describe("CourierSelector", () => { it("selects the lowest priority connected courier", () => expect(selectCourier(candidates).id).toBe("b")); it("rejects an unavailable manual courier", () => expect(() => selectCourier(candidates, "c")).toThrow()); });

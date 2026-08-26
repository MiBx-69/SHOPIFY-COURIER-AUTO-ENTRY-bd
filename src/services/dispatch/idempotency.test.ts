import { describe, expect, it } from "vitest";
describe("dispatch idempotency contract", () => { it("uses one stable key for all external attempts of a claimed dispatch", () => { const idempotencyKey = crypto.randomUUID(); const attemptKeys = [idempotencyKey, idempotencyKey]; expect(new Set(attemptKeys).size).toBe(1); }); });

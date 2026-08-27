export type CourierCandidate = {
  id: string;
  provider: "redx" | "pathao" | "steadfast";
  priority: number;
  enabled: boolean;
  connection_status: string;
};

/**
 * V1 dispatch is explicitly manual. A courier is eligible only when the
 * caller supplied its config ID. Never silently fall back to priority/first
 * courier selection.
 */
export function selectCourier(candidates: CourierCandidate[], explicitId?: string) {
  const eligible = getEligibleCouriers(candidates, explicitId);
  if (!eligible.length) throw new Error("Select an enabled and connected courier before dispatching");
  return eligible[0];
}

export function getEligibleCouriers(candidates: CourierCandidate[], explicitId?: string) {
  if (!explicitId) return [];
  return candidates.filter(
    (c) => c.id === explicitId && c.enabled && c.connection_status === "connected"
  );
}

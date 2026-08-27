export type CourierCandidate = { id: string; provider: "redx" | "pathao" | "steadfast"; priority: number; enabled: boolean; connection_status: string };
export function selectCourier(candidates: CourierCandidate[], explicitId?: string) {
  const eligible = getEligibleCouriers(candidates, explicitId);
  if (!eligible.length) throw new Error("No enabled, connected courier is available");
  return eligible[0];
}

export function getEligibleCouriers(candidates: CourierCandidate[], explicitId?: string) {
  const eligible = candidates.filter((c) => c.enabled && c.connection_status === "connected").sort((a, b) => a.priority - b.priority);
  return explicitId ? eligible.filter((c) => c.id === explicitId) : eligible;
}

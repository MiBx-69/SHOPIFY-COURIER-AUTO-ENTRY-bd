export type CourierCandidate = { id: string; provider: "redx" | "pathao" | "steadfast"; priority: number; enabled: boolean; connection_status: string };
export function selectCourier(candidates: CourierCandidate[], explicitId?: string) {
  const eligible = candidates.filter((c) => c.enabled && c.connection_status === "connected").sort((a, b) => a.priority - b.priority);
  const result = explicitId ? eligible.find((c) => c.id === explicitId) : eligible[0];
  if (!result) throw new Error("No enabled, connected courier is available");
  return result;
}

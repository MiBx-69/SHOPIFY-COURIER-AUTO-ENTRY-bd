import type { CourierProviderName, CourierResult, NormalizedShipment } from "@/types/domain";

export type CourierCredentials = Record<string, string>;
export interface CourierProvider {
  readonly name: CourierProviderName;
  validateConfig(credentials: CourierCredentials): void;
  testConnection(credentials: CourierCredentials): Promise<void>;
  createShipment(payload: NormalizedShipment, credentials: CourierCredentials, idempotencyKey: string): Promise<CourierResult>;
  getTracking(trackingId: string, credentials: CourierCredentials): Promise<{ status: string; message?: string; occurredAt?: string }>;
  cancelShipment?(trackingId: string, credentials: CourierCredentials): Promise<void>;
}
export async function courierFetch(url: string, options: RequestInit, timeoutMs = 15_000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const body = await response.text();
  let data: unknown = body; try { data = JSON.parse(body); } catch { /* non-JSON safely handled below */ }
  return { response, data };
}
export function requireFields(credentials: CourierCredentials, fields: string[]) {
  const absent = fields.filter((field) => !credentials[field]);
  if (absent.length) throw new Error(`Missing courier credential fields: ${absent.join(", ")}`);
}

export type CourierProviderName = "redx" | "pathao" | "steadfast";
export type NormalizedShipment = {
  orderId: string; orderNumber: string; customerName: string; phone: string; email?: string;
  fullAddress: string; city?: string; area?: string; postalCode?: string; codAmount: number;
  items: Array<{ productName: string; variant?: string; sku?: string; quantity: number; price: number }>;
  notes?: string;
};
export type CourierResult = { outcome: "success"; trackingId: string; courierReference?: string; metadata?: Record<string, unknown> } | { outcome: "known_failure" | "unknown"; code?: string; message: string; metadata?: Record<string, unknown> };

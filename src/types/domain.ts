export type CourierProviderName = "redx" | "pathao" | "steadfast";

export type PickupLocation = {
  id: string;
  courierLocationId: string;
  name: string;
  address: string;
  phone?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  isActive: boolean;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
};

export type NormalizedShipment = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email?: string;
  fullAddress: string;
  city?: string;
  area?: string;
  postalCode?: string;
  codAmount: number;
  items: Array<{ productName: string; variant?: string; sku?: string; quantity: number; price: number }>;
  notes?: string;
  pickupLocationId?: string;
  pickupLocationName?: string;
  pickupAddress?: string;
  pickupPhone?: string;
};

export type CourierResult =
  | { outcome: "success"; trackingId: string; courierReference?: string; metadata?: Record<string, unknown> }
  | { outcome: "known_failure" | "unknown"; code?: string; message: string; metadata?: Record<string, unknown> };

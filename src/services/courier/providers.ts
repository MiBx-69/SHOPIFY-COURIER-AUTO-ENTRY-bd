import { courierFetch, requireFields, type CourierProvider, type CourierCredentials } from "@/services/courier/provider";
import type { CourierResult, NormalizedShipment, PickupLocation } from "@/types/domain";

function base(credentials: Record<string, string>, fallback?: string) {
  return (credentials.baseUrl || fallback || "").replace(/\/$/, "");
}

function unknown(error: unknown): CourierResult {
  return { outcome: "unknown", message: error instanceof Error ? error.message : "Courier request outcome is unknown" };
}

function redxToken(apiToken?: string) {
  const t = apiToken?.trim() || "";
  return t.startsWith("Bearer ") ? t : `Bearer ${t}`;
}

export function normalizeBdPhone(rawPhone?: string | null): string {
  if (!rawPhone) return "";
  // Strip all non-digit characters
  let digits = String(rawPhone).replace(/\D/g, "");
  // If starts with 880 (e.g. 8801712345678 or +8801712345678), remove country code 88
  if (digits.startsWith("880") && digits.length >= 13) {
    digits = digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith("1")) {
    // Missing leading 0 (e.g. 1712345678)
    digits = "0" + digits;
  }
  return digits;
}

export function normalizeDeliveryAddress(addr?: Record<string, string> | null, fullText?: string): string {
  if (fullText && fullText.trim().length >= 10) {
    return fullText.trim();
  }
  if (!addr || typeof addr !== "object") {
    return (fullText || "Dhaka, Bangladesh").trim();
  }
  const parts = [
    addr.address1,
    addr.address2,
    addr.area,
    addr.city,
    addr.province,
    addr.zip,
    addr.country || "Bangladesh"
  ]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);

  let formatted = parts.join(", ");
  if (formatted.length < 10) {
    formatted = `${formatted}, Bangladesh`.replace(/,\s*,/g, ",").trim();
  }
  if (formatted.length < 10) {
    formatted = `${formatted} (Delivery Address)`.trim();
  }
  return formatted || "Dhaka, Bangladesh";
}

export function extractCourierErrorMessage(data: unknown, fallbackMessage: string): string {
  if (!data || typeof data !== "object") return fallbackMessage;
  const d = data as Record<string, unknown>;

  // Check for nested errors object (Pathao / REDX / Laravel format)
  if (d.errors && typeof d.errors === "object") {
    const errorDetails: string[] = [];
    for (const [key, val] of Object.entries(d.errors as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        errorDetails.push(`${key}: ${val.join(", ")}`);
      } else if (typeof val === "string") {
        errorDetails.push(`${key}: ${val}`);
      } else if (typeof val === "object" && val !== null) {
        errorDetails.push(`${key}: ${JSON.stringify(val)}`);
      }
    }
    if (errorDetails.length > 0) {
      const baseMsg = typeof d.message === "string" ? d.message : fallbackMessage;
      return `${baseMsg} (${errorDetails.join("; ")})`;
    }
  }

  if (typeof d.message === "string" && d.message.trim().length > 0) {
    return d.message;
  }
  if (typeof d.error === "string" && d.error.trim().length > 0) {
    return d.error;
  }
  if (typeof d.msg === "string" && d.msg.trim().length > 0) {
    return d.msg;
  }

  return fallbackMessage;
}

export class RedxProvider implements CourierProvider {
  readonly name = "redx" as const;

  validateConfig(c: Record<string, string>) {
    requireFields(c, ["apiToken"]);
  }

  getCapabilities() {
    return {
      supportsPickupLocations: true,
      supportsPerShipmentPickupLocation: true,
      supportsPickupLocationSync: true,
      supportsCancellation: true
    };
  }

  private baseUrl(c: Record<string, string>) {
    const isSandbox = (c.environment || "").toLowerCase() === "sandbox";
    return isSandbox ? "https://sandbox.redx.com.bd/v1.0.0-beta" : "https://openapi.redx.com.bd/v1.0.0-beta";
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);
    
    // Test connection by subscribing
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/no-area-parcels/subscribe`, {
      method: "POST",
      headers: { "API-ACCESS-TOKEN": token, "Content-Type": "application/json" }
    });

    if (!response.ok) {
      const err = (data as { message?: string })?.message || "REDX subscription/test failed";
      throw new Error(err);
    }
  }

  async getPickupLocations(c: CourierCredentials): Promise<PickupLocation[]> {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);
    
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/pickup/stores`, {
      headers: { "API-ACCESS-TOKEN": token }
    });

    const d = data as { pickup_stores?: Array<Record<string, unknown>> };
    const rawList = Array.isArray(d?.pickup_stores) ? d.pickup_stores : [];

    if (response.ok && rawList.length > 0) {
      return rawList.map((s) => ({
        id: String(s.id),
        courierLocationId: String(s.id),
        name: String(s.name || `Store #${s.id}`),
        address: String(s.address || ""),
        phone: s.phone ? String(s.phone) : undefined,
        city: undefined,
        area: s.area_name ? String(s.area_name) : undefined,
        isActive: true
      }));
    }

    return [];
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const token = redxToken(c.apiToken);

      const phone = normalizeBdPhone(p.phone);
      if (!phone || phone.length < 11) {
        return {
          outcome: "known_failure",
          message: `Invalid customer phone number: "${p.phone}". REDX requires an 11-digit mobile number.`
        };
      }

      let address = (p.fullAddress || "").trim();
      if (address.length < 10) {
        address = `${address}, ${p.area || ""}, ${p.city || "Dhaka"}, Bangladesh`.replace(/,\s*,/g, ",").trim();
      }

      const codAmount = Math.max(0, Math.round(Number(p.codAmount || 0)));
      const weight = Number(c.defaultWeightKg || 0.5) || 0.5;
      const instruction = c.defaultInstruction || p.notes || "";

      // Exactly the specified payload
      const payload: Record<string, any> = {
        customer_name: p.customerName || "Customer",
        customer_phone: phone,
        customer_address: address,
        merchant_invoice_id: String(p.orderNumber || p.orderId),
        cash_collection_amount: String(codAmount),
        parcel_weight: weight,
        instruction: instruction,
        value: codAmount > 0 ? codAmount : 500
      };

      if (p.pickupLocationId) {
        const storeId = Number(p.pickupLocationId);
        if (!isNaN(storeId) && storeId > 0) {
          payload.pickup_store_id = storeId;
        }
      }

      const { response, data } = await courierFetch(`${this.baseUrl(c)}/no-area-parcels`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "API-ACCESS-TOKEN": token, "Idempotency-Key": key },
        body: JSON.stringify(payload)
      });

      const d = data as Record<string, unknown>;
      const tracking = String(d.tracking_id || "");

      if (response.status === 201 && tracking && tracking !== "undefined") {
        return { outcome: "success", trackingId: tracking, courierReference: tracking, metadata: { status: response.status } };
      }

      const errorMsg = extractCourierErrorMessage(data, (d.message as string) || "REDX did not accept this shipment");
      return { 
        outcome: response.status >= 500 ? "unknown" : "known_failure", 
        message: errorMsg, 
        metadata: { status: response.status, data: d } 
      };
    } catch (e) {
      return unknown(e);
    }
  }

  async getTracking(trackingId: string, c: Record<string, string>) {
    const token = redxToken(c.apiToken);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/parcel/info/${encodeURIComponent(trackingId)}`, {
      headers: { "API-ACCESS-TOKEN": token }
    });
    if (!response.ok) throw new Error("Unable to fetch REDX tracking");
    const d = data as Record<string, unknown>;
    return { status: String(d.status || "unknown"), message: typeof d.message === "string" ? d.message : undefined };
  }

  async cancelShipment(trackingId: string, c: Record<string, string>): Promise<void> {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/parcel/cancel/${encodeURIComponent(trackingId)}`, {
      method: "POST",
      headers: { "API-ACCESS-TOKEN": token }
    });
    if (!response.ok) {
      const d = data as { message?: string };
      throw new Error(d?.message || "REDX rejected cancellation for this shipment");
    }
  }
}

export class PathaoProvider implements CourierProvider {
  readonly name = "pathao" as const;

  validateConfig(c: Record<string, string>) {
    requireFields(c, ["clientId", "clientSecret", "username", "password"]);
  }

  getCapabilities() {
    return {
      supportsPickupLocations: true,
      supportsPerShipmentPickupLocation: true,
      supportsPickupLocationSync: true,
      supportsCancellation: true
    };
  }

  private baseUrl(c: Record<string, string>) {
    const isSandbox = (c.environment || "").toLowerCase() === "sandbox";
    return isSandbox ? "https://api-hermes-sandbox.pathao.com" : "https://api-hermes.pathao.com";
  }

  private async token(c: Record<string, string>) {
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/issue-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        username: c.username,
        password: c.password,
        grant_type: "password"
      })
    });
    const token = (data as { access_token?: string }).access_token;
    if (!response.ok || !token) throw new Error("Pathao credentials were rejected");
    return token;
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    await this.token(c);
  }

  async getPickupLocations(c: CourierCredentials): Promise<PickupLocation[]> {
    this.validateConfig(c);
    const token = await this.token(c);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/stores`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const d = data as { data?: { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> };
    const rawList = Array.isArray(d?.data) ? d.data : Array.isArray(d?.data?.data) ? d.data.data : [];

    if (response.ok && rawList.length > 0) {
      return rawList.map((s) => ({
        id: String(s.store_id || s.id),
        courierLocationId: String(s.store_id || s.id),
        name: String(s.store_name || s.name || "Pathao Store"),
        address: String(s.store_address || s.address || ""),
        phone: s.store_phone ? String(s.store_phone) : undefined,
        city: s.city_name ? String(s.city_name) : undefined,
        area: s.zone_name ? String(s.zone_name) : undefined,
        isActive: Boolean(s.is_active ?? true)
      }));
    }

    if (c.storeId) {
      return [
        {
          id: String(c.storeId),
          courierLocationId: String(c.storeId),
          name: c.senderName ? `${c.senderName} Store` : `Store #${c.storeId}`,
          address: c.pickupAddress || "Registered Merchant Address",
          phone: c.senderPhone || undefined,
          isActive: true
        }
      ];
    }

    return [];
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const token = await this.token(c);

      // Resolve store_id
      const chosenStoreId = Number(p.pickupLocationId);

      if (isNaN(chosenStoreId) || chosenStoreId <= 0) {
        return {
          outcome: "known_failure",
          message: "Pathao requires a valid numeric Pickup Store ID. Please select a valid Pathao pickup store."
        };
      }

      const phone = normalizeBdPhone(p.phone);
      if (!phone || phone.length < 11) {
        return {
          outcome: "known_failure",
          message: `Invalid customer phone number: "${p.phone}". Pathao requires an 11-digit Bangladeshi mobile number (e.g. 01XXXXXXXXX).`
        };
      }

      let address = (p.fullAddress || "").trim();
      if (address.length < 10) {
        address = `${address}, ${p.area || ""}, ${p.city || "Dhaka"}, Bangladesh`.replace(/,\s*,/g, ",").trim();
      }

      const itemQty = Math.max(1, (p.items || []).reduce((n, item) => n + (item.quantity || 1), 0));
      const weight = Math.max(0.5, Math.min(10.0, Number(c.defaultWeightKg || 0.5) || 0.5));
      const codAmount = Math.max(0, Math.round(Number(p.codAmount || 0)));
      const itemDesc = (p.items || []).map((i) => `${i.productName || "Item"}${i.variant ? ` (${i.variant})` : ""}`).join(", ").slice(0, 150) || "General Goods";

      const payload = {
        store_id: chosenStoreId,
        merchant_order_id: String(p.orderNumber || p.orderId).replace(/[^a-zA-Z0-9_-]/g, "") || String(p.orderId),
        sender_name: "Merchant",
        sender_phone: "01700000000",
        recipient_name: p.customerName || "Customer",
        recipient_phone: phone,
        recipient_address: address,
        delivery_type: Number(c.deliveryType || 48),
        item_type: Number(c.itemType || 2),
        special_instruction: p.notes || "",
        item_quantity: itemQty,
        item_weight: weight,
        item_description: itemDesc,
        amount_to_collect: codAmount
      };

      const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(payload)
      });
      const d = data as { data?: { consignment_id?: string; order_id?: string }; message?: string };
      const tracking = d.data?.consignment_id;
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: d.data?.order_id, metadata: { status: response.status } };
      }

      const errorMsg = extractCourierErrorMessage(data, d.message || "Pathao did not accept this shipment");
      return { 
        outcome: response.status >= 500 ? "unknown" : "known_failure", 
        message: errorMsg, 
        metadata: { status: response.status, data: d } 
      };
    } catch (e) {
      return unknown(e);
    }
  }

  async getTracking(trackingId: string, c: Record<string, string>) {
    const token = await this.token(c);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Unable to fetch Pathao tracking");
    const d = data as { data?: { order_status?: string; updated_at?: string } };
    return { status: d.data?.order_status || "unknown", occurredAt: d.data?.updated_at };
  }

  async cancelShipment(trackingId: string, c: Record<string, string>): Promise<void> {
    this.validateConfig(c);
    const token = await this.token(c);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });
    if (!response.ok) {
      const d = data as { message?: string };
      throw new Error(d?.message || "Pathao rejected cancellation for this shipment");
    }
  }
}

export class SteadfastProvider implements CourierProvider {
  readonly name = "steadfast" as const;

  validateConfig(c: Record<string, string>) {
    requireFields(c, ["apiKey", "secretKey"]);
  }

  getCapabilities() {
    return {
      supportsPickupLocations: false,
      supportsPerShipmentPickupLocation: false,
      supportsPickupLocationSync: false,
      supportsCancellation: false
    };
  }

  private baseUrl(c: Record<string, string>) {
    const isSandbox = (c.environment || "").toLowerCase() === "sandbox";
    return isSandbox ? "https://sandbox.steadfast.com.bd" : "https://portal.steadfast.com.bd";
  }

  private headers(c: Record<string, string>) {
    return { "Api-Key": c.apiKey, "Secret-Key": c.secretKey, "Content-Type": "application/json" };
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    const { response } = await courierFetch(`${this.baseUrl(c)}/api/v1/get_balance`, {
      headers: this.headers(c)
    });
    if (!response.ok) throw new Error("Steadfast credentials were rejected");
  }

  async getPickupLocations(_c: CourierCredentials): Promise<PickupLocation[]> {
    return [];
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);

      const phone = normalizeBdPhone(p.phone);
      if (!phone || phone.length < 11) {
        return {
          outcome: "known_failure",
          message: `Invalid customer phone number: "${p.phone}". Steadfast requires an 11-digit mobile number.`
        };
      }

      let address = (p.fullAddress || "").trim();
      if (address.length < 10) {
        address = `${address}, ${p.area || ""}, ${p.city || "Dhaka"}, Bangladesh`.replace(/,\s*,/g, ",").trim();
      }

      const codAmount = Math.max(0, Math.round(Number(p.codAmount || 0)));

      const { response, data } = await courierFetch(`${this.baseUrl(c)}/api/v1/create_order`, {
        method: "POST",
        headers: { ...this.headers(c), "Idempotency-Key": key },
        body: JSON.stringify({
          invoice: String(p.orderNumber || p.orderId),
          recipient_name: p.customerName || "Customer",
          recipient_phone: phone,
          recipient_address: address,
          cod_amount: codAmount,
          note: p.notes || "",
          delivery_type: Number(c.deliveryType || 0)
        })
      });
      const d = data as { status?: number; consignment_id?: string; tracking_code?: string; message?: string };
      const tracking = d.tracking_code || d.consignment_id;
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: d.consignment_id, metadata: { status: response.status } };
      }

      const errorMsg = extractCourierErrorMessage(data, d.message || "Steadfast did not accept this shipment");
      return { 
        outcome: response.status >= 500 ? "unknown" : "known_failure", 
        message: errorMsg, 
        metadata: { status: response.status, data: d } 
      };
    } catch (e) {
      return unknown(e);
    }
  }

  async getTracking(trackingId: string, c: Record<string, string>) {
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/api/v1/status_by_trackingcode/${encodeURIComponent(trackingId)}`, {
      headers: this.headers(c)
    });
    if (!response.ok) throw new Error("Unable to fetch Steadfast tracking");
    const d = data as { delivery_status?: string; updated_at?: string };
    return { status: d.delivery_status || "unknown", occurredAt: d.updated_at };
  }

  async cancelShipment(_trackingId: string, _c: Record<string, string>): Promise<void> {
    throw new Error("Courier cancellation is not supported for Steadfast shipments via API. Please contact Steadfast support.");
  }
}

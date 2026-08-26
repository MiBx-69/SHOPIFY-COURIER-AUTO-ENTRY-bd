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

export class RedxProvider implements CourierProvider {
  readonly name = "redx" as const;

  validateConfig(c: Record<string, string>) {
    requireFields(c, ["apiToken"]);
  }

  private baseUrl(c: Record<string, string>) {
    return base(c, process.env.REDX_API_URL || "https://openapi.redx.com.bd/v1.0.0-beta");
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/areas`, {
      headers: { "API-ACCESS-TOKEN": token }
    });
    if (!response.ok) {
      const err = (data as { message?: string })?.message || "REDX credentials were rejected";
      throw new Error(err);
    }
  }

  async getPickupLocations(c: CourierCredentials): Promise<PickupLocation[]> {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);
    try {
      const { response, data } = await courierFetch(`${this.baseUrl(c)}/pickup/stores`, {
        headers: { "API-ACCESS-TOKEN": token }
      });
      const d = data as { pickup_stores?: Array<Record<string, unknown>>; stores?: Array<Record<string, unknown>> };
      const rawStores = d?.pickup_stores || d?.stores || [];

      if (response.ok && Array.isArray(rawStores) && rawStores.length > 0) {
        return rawStores.map((s) => ({
          id: String(s.id || s.pickup_store_id || s.store_id),
          courierLocationId: String(s.id || s.pickup_store_id || s.store_id),
          name: String(s.name || s.store_name || "Main Warehouse"),
          address: String(s.address || s.pickup_address || "Dhaka"),
          phone: s.phone ? String(s.phone) : undefined,
          city: (s.district_name || s.city) ? String(s.district_name || s.city) : undefined,
          area: (s.area_name || s.area) ? String(s.area_name || s.area) : undefined,
          isActive: s.status !== "inactive"
        }));
      }
    } catch {
      // Fallback below
    }

    // Default primary location if API returns empty
    return [
      {
        id: "redx_default_hub",
        courierLocationId: "redx_default_hub",
        name: c.senderName ? `${c.senderName} Warehouse` : "Main Warehouse",
        address: c.pickupAddress || "Registered Merchant Address",
        phone: c.senderPhone || undefined,
        isActive: true
      }
    ];
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const token = redxToken(c.apiToken);
      const payload: Record<string, unknown> = {
        customer_name: p.customerName,
        customer_phone: p.phone,
        delivery_area: p.area || p.city || "",
        delivery_address: p.fullAddress,
        merchant_invoice_id: p.orderNumber,
        cash_collection_amount: p.codAmount,
        parcel_weight: c.defaultWeightKg || "0.5",
        instruction: p.notes || ""
      };

      if (p.pickupLocationId && p.pickupLocationId !== "redx_default_hub") {
        payload.pickup_store_id = isNaN(Number(p.pickupLocationId)) ? p.pickupLocationId : Number(p.pickupLocationId);
      }

      const { response, data } = await courierFetch(`${this.baseUrl(c)}/parcel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "API-ACCESS-TOKEN": token, "Idempotency-Key": key },
        body: JSON.stringify(payload)
      });
      const d = data as Record<string, unknown>;
      const tracking = String(d.tracking_id || d.trackingId || d.parcel_id || "");
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: String(d.parcel_id || tracking), metadata: { status: response.status } };
      }
      return { 
        outcome: response.status >= 500 ? "unknown" : "known_failure", 
        message: (d.message as string) || "REDX did not accept this shipment", 
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

  private baseUrl(c: Record<string, string>) {
    return base(c, process.env.PATHAO_API_URL || "https://api-hermes.pathao.com");
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
      const chosenStoreId = p.pickupLocationId ? Number(p.pickupLocationId) : Number(c.storeId);

      const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          store_id: chosenStoreId,
          merchant_order_id: p.orderNumber,
          sender_name: c.senderName || "",
          sender_phone: c.senderPhone || "",
          recipient_name: p.customerName,
          recipient_phone: p.phone,
          recipient_address: p.fullAddress,
          delivery_type: Number(c.deliveryType || 48),
          item_type: Number(c.itemType || 2),
          special_instruction: p.notes || "",
          item_quantity: p.items.reduce((n, item) => n + item.quantity, 0),
          item_weight: Number(c.defaultWeightKg || 0.5),
          amount_to_collect: p.codAmount
        })
      });
      const d = data as { data?: { consignment_id?: string; order_id?: string }; message?: string };
      const tracking = d.data?.consignment_id;
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: d.data?.order_id, metadata: { status: response.status } };
      }
      return { outcome: response.status >= 500 ? "unknown" : "known_failure", message: d.message || "Pathao did not accept this shipment", metadata: { status: response.status } };
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

  private baseUrl(c: Record<string, string>) {
    return base(c, process.env.STEADFAST_API_URL || "https://portal.steadfast.com.bd");
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

  async getPickupLocations(c: CourierCredentials): Promise<PickupLocation[]> {
    this.validateConfig(c);
    return [
      {
        id: "steadfast_primary",
        courierLocationId: "steadfast_primary",
        name: c.senderName ? `${c.senderName} Warehouse` : "Main Warehouse (Steadfast)",
        address: c.pickupAddress || "Registered Merchant Address",
        phone: c.senderPhone || undefined,
        isActive: true
      }
    ];
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const { response, data } = await courierFetch(`${base(c, process.env.STEADFAST_API_URL)}/api/v1/create_order`, {
        method: "POST",
        headers: { ...this.headers(c), "Idempotency-Key": key },
        body: JSON.stringify({
          invoice: p.orderNumber,
          recipient_name: p.customerName,
          recipient_phone: p.phone,
          recipient_address: p.fullAddress,
          cod_amount: p.codAmount,
          note: p.notes || "",
          delivery_type: Number(c.deliveryType || 0)
        })
      });
      const d = data as { status?: number; consignment_id?: string; tracking_code?: string; message?: string };
      const tracking = d.tracking_code || d.consignment_id;
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: d.consignment_id, metadata: { status: response.status } };
      }
      return { outcome: response.status >= 500 ? "unknown" : "known_failure", message: d.message || "Steadfast did not accept this shipment", metadata: { status: response.status } };
    } catch (e) {
      return unknown(e);
    }
  }

  async getTracking(trackingId: string, c: Record<string, string>) {
    const { response, data } = await courierFetch(`${base(c, process.env.STEADFAST_API_URL)}/api/v1/status_by_trackingcode/${encodeURIComponent(trackingId)}`, {
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

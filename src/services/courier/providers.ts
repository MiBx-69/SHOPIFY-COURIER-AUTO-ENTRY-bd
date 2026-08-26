import { courierFetch, requireFields, type CourierProvider } from "@/services/courier/provider";
import type { CourierResult, NormalizedShipment } from "@/types/domain";

function base(credentials: Record<string, string>, fallback?: string) {
  return (credentials.baseUrl || fallback || "").replace(/\/$/, "");
}

function unknown(error: unknown): CourierResult {
  return { outcome: "unknown", message: error instanceof Error ? error.message : "Courier request outcome is unknown" };
}

export class RedxProvider implements CourierProvider {
  readonly name = "redx" as const;

  validateConfig(c: Record<string, string>) {
    requireFields(c, ["apiToken"]);
    if (!base(c, process.env.REDX_API_URL)) throw new Error("REDX_API_URL or credentials.baseUrl is required");
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    const { response } = await courierFetch(`${base(c, process.env.REDX_API_URL)}/parcel/track`, {
      headers: { "API-ACCESS-TOKEN": c.apiToken }
    });
    if (!response.ok && response.status !== 400) throw new Error("REDX credentials were rejected");
  }

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const { response, data } = await courierFetch(`${base(c, process.env.REDX_API_URL)}/parcel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "API-ACCESS-TOKEN": c.apiToken, "Idempotency-Key": key },
        body: JSON.stringify({
          customer_name: p.customerName,
          customer_phone: p.phone,
          delivery_area: p.area || p.city || "",
          delivery_address: p.fullAddress,
          merchant_invoice_id: p.orderNumber,
          cash_collection_amount: p.codAmount,
          parcel_weight: c.defaultWeightKg || "0.5",
          instruction: p.notes || ""
        })
      });
      const d = data as Record<string, unknown>;
      const tracking = String(d.tracking_id || d.trackingId || d.parcel_id || "");
      if (response.ok && tracking) {
        return { outcome: "success", trackingId: tracking, courierReference: String(d.parcel_id || tracking), metadata: { status: response.status } };
      }
      return { outcome: response.status >= 500 ? "unknown" : "known_failure", message: "REDX did not accept this shipment", metadata: { status: response.status } };
    } catch (e) {
      return unknown(e);
    }
  }

  async getTracking(trackingId: string, c: Record<string, string>) {
    const { response, data } = await courierFetch(`${base(c, process.env.REDX_API_URL)}/parcel/track/${encodeURIComponent(trackingId)}`, {
      headers: { "API-ACCESS-TOKEN": c.apiToken }
    });
    if (!response.ok) throw new Error("Unable to fetch REDX tracking");
    const d = data as Record<string, unknown>;
    return { status: String(d.status || "unknown"), message: typeof d.message === "string" ? d.message : undefined };
  }

  async cancelShipment(trackingId: string, c: Record<string, string>): Promise<void> {
    this.validateConfig(c);
    const { response, data } = await courierFetch(`${base(c, process.env.REDX_API_URL)}/parcel/cancel/${encodeURIComponent(trackingId)}`, {
      method: "POST",
      headers: { "API-ACCESS-TOKEN": c.apiToken }
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
    requireFields(c, ["clientId", "clientSecret", "username", "password", "storeId"]);
    if (!base(c, process.env.PATHAO_API_URL)) throw new Error("PATHAO_API_URL or credentials.baseUrl is required");
  }

  private async token(c: Record<string, string>) {
    const { response, data } = await courierFetch(`${base(c, process.env.PATHAO_API_URL)}/aladdin/api/v1/issue-token`, {
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

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const token = await this.token(c);
      const { response, data } = await courierFetch(`${base(c, process.env.PATHAO_API_URL)}/aladdin/api/v1/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({
          store_id: Number(c.storeId),
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
    const { response, data } = await courierFetch(`${base(c, process.env.PATHAO_API_URL)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error("Unable to fetch Pathao tracking");
    const d = data as { data?: { order_status?: string; updated_at?: string } };
    return { status: d.data?.order_status || "unknown", occurredAt: d.data?.updated_at };
  }

  async cancelShipment(trackingId: string, c: Record<string, string>): Promise<void> {
    this.validateConfig(c);
    const token = await this.token(c);
    const { response, data } = await courierFetch(`${base(c, process.env.PATHAO_API_URL)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/cancel`, {
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
    if (!base(c, process.env.STEADFAST_API_URL)) throw new Error("STEADFAST_API_URL or credentials.baseUrl is required");
  }

  private headers(c: Record<string, string>) {
    return { "Api-Key": c.apiKey, "Secret-Key": c.secretKey, "Content-Type": "application/json" };
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    const { response } = await courierFetch(`${base(c, process.env.STEADFAST_API_URL)}/api/v1/get_balance`, {
      headers: this.headers(c)
    });
    if (!response.ok) throw new Error("Steadfast credentials were rejected");
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

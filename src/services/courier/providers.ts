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
      supportsPerShipmentPickupLocation: false,
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
    
    // Test connection by fetching pickup stores
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/pickup/stores`, {
      method: "GET",
      headers: { "API-ACCESS-TOKEN": token, "Content-Type": "application/json" }
    });

    if (!response.ok) {
      const err = (data as { message?: string })?.message || "REDX authentication failed. Invalid token.";
      throw new Error(err);
    }
  }

  async getPickupLocations(c: CourierCredentials): Promise<PickupLocation[]> {
    this.validateConfig(c);
    const token = redxToken(c.apiToken);

    const { response, data } = await courierFetch(`${this.baseUrl(c)}/pickup/stores`, {
      method: "GET",
      headers: { "API-ACCESS-TOKEN": token, "Content-Type": "application/json" }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch REDX pickup stores.");
    }

    const stores = (data as { pickup_stores?: Array<any> }).pickup_stores || [];
    return stores.map((s) => ({
      id: String(s.id),
      courierLocationId: String(s.id),
      name: s.name,
      address: s.address,
      areaId: String(s.area_id),
      isActive: true
    }));
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
        payload.pickup_store_id = Number(p.pickupLocationId);
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
    // Sandbox URL per official Pathao docs: courier-api-sandbox.pathao.com
    return isSandbox ? "https://courier-api-sandbox.pathao.com" : "https://api-hermes.pathao.com";
  }

  /**
   * Returns a valid Bearer access token for the given courier config.
   *
   * Strategy (fastest-first):
   *   1. Redis cache (key: mibx:pathao:token:<courierConfigId>)
   *   2. DB row in courier_oauth_tokens — if not expired, use it and warm Redis
   *   3. Try refresh_token grant if a refresh token exists in DB
   *   4. Full password grant as last resort; persist result to DB + Redis
   *
   * courierConfigId is optional — when not supplied (e.g. testConnection before
   * the config is saved) we always do a fresh password grant and don't persist.
   */
  private async getToken(
    c: Record<string, string>,
    courierConfigId?: string
  ): Promise<string> {
    // ── 1. Redis hot cache ───────────────────────────────────────────────────
    if (courierConfigId) {
      const { redis } = await import("@/lib/redis");
      if (redis) {
        const cached = await redis.get<string>(`mibx:pathao:token:${courierConfigId}`);
        if (cached) return cached;
      }
    }

    // ── 2. DB token row ──────────────────────────────────────────────────────
    if (courierConfigId) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("courier_oauth_tokens")
        .select("access_token, refresh_token, expires_at, shop_id")
        .eq("courier_config_id", courierConfigId)
        .maybeSingle();

      if (row) {
        const expiresAt = new Date(row.expires_at).getTime();
        const nowMs = Date.now();
        const bufferMs = 5 * 60 * 1000; // refresh 5 mins before expiry

        if (expiresAt - nowMs > bufferMs) {
          // Token still valid — warm Redis and return
          await this.warmRedisCache(courierConfigId, row.access_token, expiresAt);
          return row.access_token;
        }

        // Token expired — try refresh grant if we have a refresh_token
        if (row.refresh_token) {
          try {
            const refreshed = await this.issueTokenFromRefresh(c, row.refresh_token);
            await this.persistToken(courierConfigId, row.shop_id, refreshed);
            return refreshed.access_token;
          } catch {
            // refresh failed — fall through to password grant
          }
        }
      }
    }

    // ── 3. Full password grant ───────────────────────────────────────────────
    const issued = await this.issueTokenFromPassword(c);

    if (courierConfigId) {
      // Need shop_id to persist — look it up from courier_configs
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: config } = await admin
        .from("courier_configs")
        .select("shop_id")
        .eq("id", courierConfigId)
        .single();

      if (config?.shop_id) {
        await this.persistToken(courierConfigId, config.shop_id, issued);
      }
    }

    return issued.access_token;
  }

  /** POST /aladdin/api/v1/issue-token with grant_type=password */
  private async issueTokenFromPassword(c: Record<string, string>): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }> {
    const { response, data } = await courierFetch(
      `${this.baseUrl(c)}/aladdin/api/v1/issue-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          username: c.username,
          password: c.password,
          grant_type: "password"
        })
      }
    );
    const d = data as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !d.access_token) {
      throw new Error("Pathao credentials were rejected");
    }
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in ?? 432000 };
  }

  /** POST /aladdin/api/v1/issue-token with grant_type=refresh_token */
  private async issueTokenFromRefresh(
    c: Record<string, string>,
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const { response, data } = await courierFetch(
      `${this.baseUrl(c)}/aladdin/api/v1/issue-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: c.clientId,
          client_secret: c.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      }
    );
    const d = data as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !d.access_token) {
      throw new Error("Pathao refresh token was rejected");
    }
    return { access_token: d.access_token, refresh_token: d.refresh_token, expires_in: d.expires_in ?? 432000 };
  }

  /** Upsert token to DB and warm Redis cache */
  private async persistToken(
    courierConfigId: string,
    shopId: string,
    token: { access_token: string; refresh_token?: string; expires_in: number }
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      await admin.from("courier_oauth_tokens").upsert(
        {
          courier_config_id: courierConfigId,
          shop_id: shopId,
          access_token: token.access_token,
          refresh_token: token.refresh_token ?? null,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        },
        { onConflict: "courier_config_id" }
      );
    } catch (err) {
      // DB persist failure should not block the request
      console.warn("[Pathao] Failed to persist OAuth token to DB:", err);
    }

    await this.warmRedisCache(
      courierConfigId,
      token.access_token,
      new Date(expiresAt).getTime()
    );
  }

  /** Store access token in Redis with a TTL 5 min shorter than actual expiry */
  private async warmRedisCache(
    courierConfigId: string,
    accessToken: string,
    expiresAtMs: number
  ): Promise<void> {
    try {
      const { redis } = await import("@/lib/redis");
      if (!redis) return;
      const ttlSeconds = Math.max(60, Math.floor((expiresAtMs - Date.now()) / 1000) - 300);
      await redis.setex(`mibx:pathao:token:${courierConfigId}`, ttlSeconds, accessToken);
    } catch {
      // Redis failure is non-fatal
    }
  }

  /** Invalidate stored token (e.g. on credential replacement) */
  async invalidateToken(courierConfigId: string): Promise<void> {
    try {
      const { redis } = await import("@/lib/redis");
      if (redis) await redis.del(`mibx:pathao:token:${courierConfigId}`);

      const { createAdminClient } = await import("@/lib/supabase/admin");
      await createAdminClient()
        .from("courier_oauth_tokens")
        .delete()
        .eq("courier_config_id", courierConfigId);
    } catch {
      // Non-fatal
    }
  }

  async testConnection(c: Record<string, string>) {
    this.validateConfig(c);
    // Always do a fresh password grant on test — do NOT use cached token
    await this.issueTokenFromPassword(c);
  }

  async getPickupLocations(c: CourierCredentials, courierConfigId?: string): Promise<PickupLocation[]> {
    this.validateConfig(c);
    const token = await this.getToken(c, courierConfigId);
    const { response, data } = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/stores`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // If token was stale, invalidate and retry once with a fresh token
    if (response.status === 401 && courierConfigId) {
      await this.invalidateToken(courierConfigId);
      const freshToken = await this.getToken(c, courierConfigId);
      const retry = await courierFetch(`${this.baseUrl(c)}/aladdin/api/v1/stores`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      if (!retry.response.ok) {
        throw new Error(`Pathao stores API error after token refresh: ${retry.response.status}`);
      }
      const rd = retry.data as { data?: { data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> };
      const retryList = Array.isArray(rd?.data) ? rd.data : Array.isArray(rd?.data?.data) ? rd.data.data : [];
      return retryList.map((s) => ({
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

    if (!response.ok) {
      // Surface the error so the sync route returns a useful message instead of 0 locations
      const errMsg = (data as { message?: string })?.message ?? `HTTP ${response.status}`;
      throw new Error(`Pathao stores API error: ${errMsg}`);
    }

    // Fallback: manual storeId from credentials
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

  async createShipment(p: NormalizedShipment, c: Record<string, string>, key: string, courierConfigId?: string): Promise<CourierResult> {
    try {
      this.validateConfig(c);
      const token = await this.getToken(c, courierConfigId);

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
      const itemDesc = (p.items || [])
        .map((i) => `${i.productName || "Item"}${i.variant ? ` (${i.variant})` : ""}`)
        .join(", ")
        .slice(0, 150) || "General Goods";

      const payload: Record<string, unknown> = {
        store_id: chosenStoreId,
        merchant_order_id: String(p.orderNumber || p.orderId).replace(/[^a-zA-Z0-9_-]/g, "") || String(p.orderId),
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

      // 401 Unauthorized — cached token may be stale; invalidate and let next dispatch retry
      if (response.status === 401 && courierConfigId) {
        await this.invalidateToken(courierConfigId);
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

  async getTracking(trackingId: string, c: Record<string, string>, courierConfigId?: string) {
    const token = await this.getToken(c, courierConfigId);
    const { response, data } = await courierFetch(
      `${this.baseUrl(c)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error("Unable to fetch Pathao tracking");
    const d = data as { data?: { order_status?: string; updated_at?: string } };
    return { status: d.data?.order_status || "unknown", occurredAt: d.data?.updated_at };
  }

  async cancelShipment(trackingId: string, c: Record<string, string>, courierConfigId?: string): Promise<void> {
    this.validateConfig(c);
    const token = await this.getToken(c, courierConfigId);
    const { response, data } = await courierFetch(
      `${this.baseUrl(c)}/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      }
    );
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

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";
import type { PickupLocation } from "@/types/domain";

export class PickupLocationService {
  /** Fetch and synchronize pickup locations from courier API */
  static async sync(courierConfigId: string, shopId: string, userId: string): Promise<{ locations: PickupLocation[]; defaultLocationId?: string }> {
    const admin = createAdminClient();

    const { data: config, error: configErr } = await admin
      .from("courier_configs")
      .select("id, shop_id, couriers(provider, display_name)")
      .eq("id", courierConfigId)
      .eq("shop_id", shopId)
      .single();

    if (configErr || !config) throw new Error("Courier configuration not found");

    const courierMeta = config.couriers as unknown as { provider: "redx" | "pathao" | "steadfast"; display_name: string };
    const provider = courierRegistry.get(courierMeta.provider);

    const { data: secret, error: secretErr } = await admin
      .from("courier_secrets")
      .select("ciphertext, iv, auth_tag")
      .eq("courier_config_id", courierConfigId)
      .single();

    if (secretErr || !secret) throw new Error("Courier credentials not configured");

    const credentials = decryptSecret({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.auth_tag
    });

    const locations = await provider.getPickupLocations(credentials);

    // Fetch existing cache to preserve default selection if valid
    const filterKey = `__courier_pickup_locations_${courierConfigId}`;
    const { data: existing } = await admin
      .from("saved_filters")
      .select("filters")
      .eq("shop_id", shopId)
      .eq("name", filterKey)
      .maybeSingle();

    const existingFilters = existing?.filters as { default_id?: string } | undefined;
    let defaultLocationId = existingFilters?.default_id;

    if (!defaultLocationId || !locations.some((l) => l.id === defaultLocationId)) {
      defaultLocationId = locations[0]?.id;
    }

    const payload = {
      courier_config_id: courierConfigId,
      provider: courierMeta.provider,
      locations,
      default_id: defaultLocationId,
      synced_at: new Date().toISOString()
    };

    // Upsert into saved_filters as tenant cache
    await admin.from("saved_filters").upsert(
      {
        shop_id: shopId,
        user_id: userId,
        name: filterKey,
        filters: payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id, user_id, name" }
    );

    return { locations, defaultLocationId };
  }

  /** Retrieve cached locations or trigger sync if missing */
  static async get(courierConfigId: string, shopId: string, userId: string): Promise<{ locations: PickupLocation[]; defaultLocationId?: string }> {
    const admin = createAdminClient();
    const filterKey = `__courier_pickup_locations_${courierConfigId}`;

    const { data: cached } = await admin
      .from("saved_filters")
      .select("filters")
      .eq("shop_id", shopId)
      .eq("name", filterKey)
      .maybeSingle();

    if (cached?.filters) {
      const f = cached.filters as { locations: PickupLocation[]; default_id?: string };
      if (Array.isArray(f.locations) && f.locations.length > 0) {
        return { locations: f.locations, defaultLocationId: f.default_id };
      }
    }

    // Auto-sync if not cached
    try {
      return await this.sync(courierConfigId, shopId, userId);
    } catch {
      return { locations: [], defaultLocationId: undefined };
    }
  }

  /** Set default pickup location */
  static async setDefault(courierConfigId: string, shopId: string, userId: string, locationId: string): Promise<void> {
    const admin = createAdminClient();
    const filterKey = `__courier_pickup_locations_${courierConfigId}`;

    const { data: cached } = await admin
      .from("saved_filters")
      .select("filters")
      .eq("shop_id", shopId)
      .eq("name", filterKey)
      .maybeSingle();

    const f = (cached?.filters || {}) as { locations?: PickupLocation[]; provider?: string };
    const locations = f.locations || [];

    if (!locations.some((l) => l.id === locationId)) {
      throw new Error("Selected pickup location is not available for this courier");
    }

    const payload = {
      ...f,
      courier_config_id: courierConfigId,
      default_id: locationId,
      updated_at: new Date().toISOString()
    };

    await admin.from("saved_filters").upsert(
      {
        shop_id: shopId,
        user_id: userId,
        name: filterKey,
        filters: payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id, user_id, name" }
    );
  }

  /** Get all pickup locations across all configured couriers for a shop */
  static async getAllForShop(shopId: string, userId: string): Promise<Record<string, { courierName: string; provider: string; locations: PickupLocation[]; defaultLocationId?: string }>> {
    const admin = createAdminClient();
    const { data: configs } = await admin
      .from("courier_configs")
      .select("id, connection_status, enabled, couriers(provider, display_name)")
      .eq("shop_id", shopId);

    const result: Record<string, { courierName: string; provider: string; locations: PickupLocation[]; defaultLocationId?: string }> = {};

    await Promise.all(
      (configs || []).map(async (c: { id: string; connection_status: string; enabled: boolean; couriers: unknown }) => {
        const meta = c.couriers as { provider: string; display_name: string };
        const data = await this.get(c.id, shopId, userId);
        result[c.id] = {
          courierName: meta.display_name,
          provider: meta.provider,
          locations: data.locations,
          defaultLocationId: data.defaultLocationId
        };
      })
    );

    return result;
  }
}

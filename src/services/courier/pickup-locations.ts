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

    // Save cache (scoped by shop_id and courier_config_id)
    const filterKey = `courier_locations_cache_${courierConfigId}`;
    await admin.from("saved_filters").upsert(
      {
        shop_id: shopId,
        user_id: userId,
        name: filterKey,
        filters: { locations, synced_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id, user_id, name" }
    );

    // Fetch the explicit preference
    const { data: pref } = await admin
      .from("courier_pickup_preferences")
      .select("pickup_location_id")
      .eq("shop_id", shopId)
      .eq("courier_config_id", courierConfigId)
      .maybeSingle();

    let defaultLocationId = pref?.pickup_location_id;
    if (!defaultLocationId && locations.length > 0) {
      defaultLocationId = locations[0]?.id;
    }

    return { locations, defaultLocationId };
  }

  /** Retrieve cached locations or trigger sync if missing */
  static async get(courierConfigId: string, shopId: string, userId: string): Promise<{ locations: PickupLocation[]; defaultLocationId?: string }> {
    const admin = createAdminClient();
    
    const filterKey = `courier_locations_cache_${courierConfigId}`;
    
    // Fetch cache and preferences in parallel
    const [cacheRes, prefRes] = await Promise.all([
      admin.from("saved_filters").select("filters").eq("shop_id", shopId).eq("name", filterKey).maybeSingle(),
      admin.from("courier_pickup_preferences").select("pickup_location_id").eq("shop_id", shopId).eq("courier_config_id", courierConfigId).maybeSingle()
    ]);

    const cachedLocs = (cacheRes.data?.filters as { locations?: PickupLocation[] })?.locations;
    let defaultLocationId = prefRes.data?.pickup_location_id;

    if (Array.isArray(cachedLocs) && cachedLocs.length > 0) {
      if (!defaultLocationId) {
        defaultLocationId = cachedLocs[0]?.id;
      }
      return { locations: cachedLocs, defaultLocationId };
    }

    // Auto-sync if not cached
    try {
      const { data: config } = await admin.from("courier_configs").select("couriers(provider)").eq("id", courierConfigId).single();
      const pName = (config?.couriers as { provider?: string })?.provider;
      if (pName) {
         const p = courierRegistry.get(pName as any);
         if (p.getCapabilities().supportsPickupLocationSync) {
           return await this.sync(courierConfigId, shopId, userId);
         }
      }
      return { locations: [], defaultLocationId: undefined };
    } catch {
      return { locations: [], defaultLocationId: undefined };
    }
  }

  /** Set default pickup location */
  static async setDefault(courierConfigId: string, shopId: string, userId: string, locationId: string): Promise<void> {
    const admin = createAdminClient();
    
    // Validate that the location exists in cache
    const filterKey = `courier_locations_cache_${courierConfigId}`;
    const { data: cached } = await admin.from("saved_filters").select("filters").eq("shop_id", shopId).eq("name", filterKey).maybeSingle();
    const locations = (cached?.filters as { locations?: PickupLocation[] })?.locations || [];
    
    const chosen = locations.find((l) => l.id === locationId);
    if (!chosen) {
      throw new Error("Selected pickup location is not available in cache for this courier");
    }

    await admin.from("courier_pickup_preferences").upsert(
      {
        shop_id: shopId,
        courier_config_id: courierConfigId,
        pickup_location_id: chosen.id,
        pickup_location_name: chosen.name,
        updated_by: userId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id, courier_config_id" }
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

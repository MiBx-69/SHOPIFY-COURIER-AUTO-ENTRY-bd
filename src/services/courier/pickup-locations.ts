import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";
import type { PickupLocation } from "@/types/domain";
import { redis, generateCacheKey } from "@/lib/redis";

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

    // Prevent concurrent syncs using Redis lock if available
    const lockKey = `mibx:lock:pickup_sync:${courierConfigId}`;
    if (redis) {
      const locked = await redis.setnx(lockKey, "locked");
      if (!locked) {
        throw new Error("A synchronization is already in progress. Please try again in a few moments.");
      }
      await redis.expire(lockKey, 30);
    }

    try {
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

      const capabilities = provider.getCapabilities();
      
      let locations: PickupLocation[] = [];
      if (capabilities.supportsPickupLocationSync) {
        locations = await provider.getPickupLocations(credentials);
      }

      // Upsert locations to the new normalized table
      if (locations.length > 0) {
        const payload = locations.map((loc) => ({
          shop_id: shopId,
          courier_config_id: courierConfigId,
          provider: courierMeta.provider,
          courier_location_id: loc.courierLocationId,
          name: loc.name,
          address: loc.address || null,
          phone: loc.phone || null,
          area: loc.area || null,
          city: loc.city || null,
          is_active: loc.isActive,
          last_synced_at: new Date().toISOString()
        }));

        await admin.from("courier_pickup_locations").upsert(payload, { 
          onConflict: "courier_config_id, courier_location_id" 
        });
      }

      // Fetch the explicit preference
      const { data: pref } = await admin
        .from("courier_pickup_preferences")
        .select("pickup_location_id")
        .eq("shop_id", shopId)
        .eq("courier_config_id", courierConfigId)
        .maybeSingle();

      const defaultLocationId = pref?.pickup_location_id;

      // Invalidate Redis cache
      if (redis) {
        const cacheKey = generateCacheKey(shopId, "pickup_locations", { courierConfigId });
        await redis.del(cacheKey);
      }

      return { locations, defaultLocationId };
    } finally {
      if (redis) await redis.del(lockKey);
    }
  }

  /** Retrieve cached locations from DB/Redis. Does NOT automatically trigger sync. */
  static async get(courierConfigId: string, shopId: string): Promise<{ locations: PickupLocation[]; defaultLocationId?: string }> {
    const admin = createAdminClient();
    
    // Check Redis cache first
    let cachedLocs: PickupLocation[] | null = null;
    const cacheKey = generateCacheKey(shopId, "pickup_locations", { courierConfigId });
    
    if (redis) {
      cachedLocs = await redis.get<PickupLocation[]>(cacheKey);
    }

    if (!cachedLocs) {
      // Fetch from normalized DB table
      const { data: dbLocs } = await admin
        .from("courier_pickup_locations")
        .select("*")
        .eq("shop_id", shopId)
        .eq("courier_config_id", courierConfigId)
        .order("name", { ascending: true });

      if (dbLocs) {
        cachedLocs = dbLocs.map(d => ({
          id: d.id,
          courierLocationId: d.courier_location_id,
          name: d.name,
          address: d.address || undefined,
          phone: d.phone || undefined,
          city: d.city || undefined,
          area: d.area || undefined,
          isActive: d.is_active
        }));
        
        if (redis && cachedLocs.length > 0) {
          await redis.setex(cacheKey, 900, cachedLocs); // 15 mins cache
        }
      } else {
        cachedLocs = [];
      }
    }

    // Fetch the explicit preference
    const { data: pref } = await admin
      .from("courier_pickup_preferences")
      .select("pickup_location_id")
      .eq("shop_id", shopId)
      .eq("courier_config_id", courierConfigId)
      .maybeSingle();

    return { locations: cachedLocs, defaultLocationId: pref?.pickup_location_id };
  }

  /** Set default pickup location */
  static async setDefault(courierConfigId: string, shopId: string, userId: string, locationId: string): Promise<void> {
    const admin = createAdminClient();
    
    // Validate that the location exists in the db for this shop and config
    const { data: loc } = await admin
      .from("courier_pickup_locations")
      .select("id, name")
      .eq("shop_id", shopId)
      .eq("courier_config_id", courierConfigId)
      .eq("id", locationId)
      .maybeSingle();
      
    if (!loc) {
      throw new Error("Selected pickup location does not exist for this courier configuration.");
    }

    await admin.from("courier_pickup_preferences").upsert(
      {
        shop_id: shopId,
        courier_config_id: courierConfigId,
        pickup_location_id: loc.id,
        pickup_location_name: loc.name,
        updated_by: userId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id, courier_config_id" }
    );
  }

  /** Get all pickup locations across all configured couriers for a shop */
  static async getAllForShop(shopId: string): Promise<Record<string, { courierName: string; provider: string; locations: PickupLocation[]; defaultLocationId?: string }>> {
    const admin = createAdminClient();
    const { data: configs } = await admin
      .from("courier_configs")
      .select("id, connection_status, enabled, couriers(provider, display_name)")
      .eq("shop_id", shopId);

    const result: Record<string, { courierName: string; provider: string; locations: PickupLocation[]; defaultLocationId?: string }> = {};

    await Promise.all(
      (configs || []).map(async (c: { id: string; connection_status: string; enabled: boolean; couriers: unknown }) => {
        const meta = c.couriers as { provider: string; display_name: string };
        const data = await this.get(c.id, shopId);
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

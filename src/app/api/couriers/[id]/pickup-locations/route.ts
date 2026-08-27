import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PickupLocationService } from "@/services/courier/pickup-locations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const start = performance.now();
    const { id } = await params;
    const admin = createAdminClient();

    const { data: config } = await admin
      .from("courier_configs")
      .select("id, shop_id, couriers(provider)")
      .eq("id", id)
      .single();

    if (!config) return NextResponse.json({ error: "Courier configuration not found" }, { status: 404 });

    const authStart = performance.now();
    const { user } = await requireShopPermission(config.shop_id, "view_orders");
    const authMs = performance.now() - authStart;
    
    // Capability check
    const courierMeta = config.couriers as unknown as { provider: string };
    const { courierRegistry } = await import("@/services/courier/registry");
    const provider = courierRegistry.get(courierMeta.provider as any);
    const capabilities = provider.getCapabilities();

    if (!capabilities.supportsPickupLocationSync) {
      const totalMs = performance.now() - start;
      return NextResponse.json({ 
        success: true,
        data: {
          supported: false,
          locations: [],
          selectedLocationId: null,
          reason: "provider_api_does_not_expose_pickup_selection"
        },
        metrics: {
          authMs,
          configDbMs: 0, // In this particular flow, config was already loaded
          pickupDbMs: 0,
          redisMs: 0,
          totalMs: Math.round(totalMs)
        }
      });
    }

    const data = await PickupLocationService.get(id, config.shop_id);

    const totalMs = performance.now() - start;

    return NextResponse.json({ 
      success: true,
      data: {
        supported: capabilities.supportsPickupLocationSync,
        locations: data.locations,
        selectedLocationId: data.defaultLocationId,
        reason: null
      },
      metrics: {
        authMs,
        configDbMs: 0,
        pickupDbMs: data.dbMs,
        redisMs: data.redisMs,
        totalMs: Math.round(totalMs)
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

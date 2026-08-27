import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PickupLocationService } from "@/services/courier/pickup-locations";

export async function POST(
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
    const { user } = await requireShopPermission(config.shop_id, "manage_couriers");
    const authMs = performance.now() - authStart;
    
    // Capability check
    const courierMeta = config.couriers as unknown as { provider: string };
    const { courierRegistry } = await import("@/services/courier/registry");
    const provider = courierRegistry.get(courierMeta.provider as any);
    const capabilities = provider.getCapabilities();

    if (!capabilities.supportsPickupLocationSync) {
      return NextResponse.json({
        success: true,
        data: {
          supported: false,
          locations: [],
          selectedLocationId: null,
          reason: "provider_api_does_not_expose_pickup_selection"
        },
        message: "Provider does not support pickup location synchronization."
      });
    }

    const dbStart = performance.now();
    const data = await PickupLocationService.sync(id, config.shop_id, user.id);
    const dbMs = performance.now() - dbStart;

    const totalMs = performance.now() - start;

    return NextResponse.json({ 
      success: true,
      data: {
        supported: true,
        locations: data.locations,
        selectedLocationId: data.defaultLocationId,
        reason: null
      },
      message: "Pickup locations synchronized successfully",
      metrics: {
        authMs,
        dbMs,
        totalMs: Math.round(totalMs)
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

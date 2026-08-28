import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { ShopifySyncService } from "@/services/synchronization/shopify-sync";
export async function POST(request: NextRequest) {
  try {
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });
    
    await requireShopPermission(shopId, "view_orders");
    
    // Check if this is the first sync
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: shop } = await admin.from("shops").select("organization_id, last_synced_at").eq("id", shopId).single();
    
    const service = new ShopifySyncService();
    const count = (!shop?.last_synced_at) ? await service.initialSync(shopId) : await service.reconcile(shopId);
    
    // Invalidate order and count caches for this shop
    if (shop?.organization_id) {
      const { invalidateOrderCaches } = await import("@/lib/cache");
      await invalidateOrderCaches(shop.organization_id, shopId);
    }
    
    return NextResponse.json({ data: { synchronized: count } });
  } catch (error) {
    return apiError(error);
  }
}

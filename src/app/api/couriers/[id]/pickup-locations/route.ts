import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PickupLocationService } from "@/services/courier/pickup-locations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const { data: config } = await admin
      .from("courier_configs")
      .select("id, shop_id")
      .eq("id", id)
      .single();

    if (!config) return NextResponse.json({ error: "Courier configuration not found" }, { status: 404 });

    const { user } = await requireShopPermission(config.shop_id, "view_orders");
    const data = await PickupLocationService.get(id, config.shop_id, user.id);

    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

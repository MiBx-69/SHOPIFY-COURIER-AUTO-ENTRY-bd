import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PickupLocationService } from "@/services/courier/pickup-locations";

const setDefaultSchema = z.object({
  locationId: z.string().min(1)
});

export async function POST(
  request: NextRequest,
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

    const { user } = await requireShopPermission(config.shop_id, "manage_couriers");
    const body = setDefaultSchema.parse(await request.json());

    await PickupLocationService.setDefault(id, config.shop_id, user.id, body.locationId);

    return NextResponse.json({ success: true, message: "Default pickup location updated" });
  } catch (error) {
    return apiError(error);
  }
}

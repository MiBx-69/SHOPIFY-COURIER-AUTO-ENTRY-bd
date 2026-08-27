import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { PickupLocationService } from "@/services/courier/pickup-locations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    await requireShopPermission(shopId, "view_orders");

    const data = await PickupLocationService.getAllForShop(shopId);
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

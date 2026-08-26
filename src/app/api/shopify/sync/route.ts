import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { ShopifySyncService } from "@/services/synchronization/shopify-sync";
export async function POST(request: NextRequest) { try { const shopId = request.nextUrl.searchParams.get("shopId"); if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 }); await requireShopPermission(shopId, "manage_shopify"); const count = await new ShopifySyncService().reconcile(shopId); return NextResponse.json({ data: { synchronized: count } }); } catch (error) { return apiError(error); } }

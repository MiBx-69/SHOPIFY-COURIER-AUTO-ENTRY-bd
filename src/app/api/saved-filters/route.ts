import { NextRequest, NextResponse } from "next/server";
import { apiError, currentUser } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createSavedFilterSchema = z.object({
  shopId: z.string().uuid(),
  name: z.string().min(1).max(80),
  filters: z.record(z.unknown())
});

export async function GET(request: NextRequest) {
  try {
    const { user, supabase } = await currentUser();
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

    const { data, error } = await supabase
      .from("saved_filters")
      .select("id, name, filters, created_at")
      .eq("shop_id", shopId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data: data || [] });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await currentUser();
    const body = createSavedFilterSchema.parse(await request.json());
    const admin = createAdminClient();

    // Verify user belongs to shop's organization
    const { data: shop } = await admin.from("shops").select("organization_id").eq("id", body.shopId).single();
    if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

    const { data: membership } = await admin
      .from("memberships")
      .select("id")
      .eq("organization_id", shop.organization_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { data, error } = await admin
      .from("saved_filters")
      .upsert({
        shop_id: body.shopId,
        user_id: user.id,
        name: body.name.trim(),
        filters: body.filters,
        updated_at: new Date().toISOString()
      }, { onConflict: "shop_id, user_id, name" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return apiError(error);
  }
}

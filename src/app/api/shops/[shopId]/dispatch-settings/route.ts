import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  automatic_courier: z.boolean().optional(),
  shipping_rules: z.array(z.record(z.unknown())).optional(),
  redispatch_settings: z.record(z.unknown()).optional()
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { user } = await requireShopPermission(shopId, "manage_settings");
    
    const input = patchSchema.parse(await request.json());
    
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };
    if (input.automatic_courier !== undefined) updatePayload.automatic_courier = input.automatic_courier;
    if (input.shipping_rules !== undefined) updatePayload.shipping_rules = input.shipping_rules;
    if (input.redispatch_settings !== undefined) updatePayload.redispatch_settings = input.redispatch_settings;

    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("shops")
      .update(updatePayload)
      .eq("id", shopId)
      .select("automatic_courier, shipping_rules, redispatch_settings")
      .single();
      
    if (error || !updated) throw error ?? new Error("Failed to update dispatch settings");
    
    // Audit log
    const { data: shop } = await admin.from("shops").select("organization_id").eq("id", shopId).single();
    if (shop) {
      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action: "dispatch_settings.updated",
        entity_type: "shop",
        entity_id: shopId,
        metadata: input
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

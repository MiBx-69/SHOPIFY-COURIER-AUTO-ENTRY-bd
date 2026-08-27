import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  shipping_method_pattern: z.string().trim().min(1).max(160),
  match_type: z.enum(["exact", "contains"]).default("contains"),
  courier_config_id: z.string().uuid(),
  priority: z.number().int().min(1).max(999),
  enabled: z.boolean().default(true)
});

const patchSchema = z.object({
  redispatch_enabled: z.boolean().optional(),
  shipping_method_routing_enabled: z.boolean().optional(),
  rules: z.array(ruleSchema).max(100).optional()
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    await requireShopPermission(shopId, "manage_settings");
    const admin = createAdminClient();

    const [{ data: shop, error: shopError }, { data: rules, error: rulesError }] = await Promise.all([
      admin
        .from("shops")
        .select("redispatch_enabled,shipping_method_routing_enabled")
        .eq("id", shopId)
        .single(),
      admin
        .from("courier_routing_rules")
        .select("id,shipping_method_pattern,match_type,courier_config_id,priority,enabled,courier_configs(id,enabled,couriers(provider,display_name))")
        .eq("shop_id", shopId)
        .order("priority", { ascending: true })
    ]);

    if (shopError) throw shopError;
    if (rulesError) throw rulesError;

    return NextResponse.json({ data: { ...shop, rules: rules ?? [] } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shopId: string }> }
) {
  try {
    const { shopId } = await params;
    const { user } = await requireShopPermission(shopId, "manage_settings");
    const input = patchSchema.parse(await request.json());
    const admin = createAdminClient();

    if (input.redispatch_enabled !== undefined || input.shipping_method_routing_enabled !== undefined) {
      const update: Record<string, boolean> = {};
      if (input.redispatch_enabled !== undefined) update.redispatch_enabled = input.redispatch_enabled;
      if (input.shipping_method_routing_enabled !== undefined) update.shipping_method_routing_enabled = input.shipping_method_routing_enabled;
      const { error } = await admin.from("shops").update(update).eq("id", shopId);
      if (error) throw error;
    }

    if (input.rules !== undefined) {
      const { data: existing, error: existingError } = await admin
        .from("courier_routing_rules")
        .select("id")
        .eq("shop_id", shopId);
      if (existingError) throw existingError;

      const incomingIds = new Set(input.rules.filter((rule) => rule.id).map((rule) => rule.id as string));
      const deleteIds = (existing ?? []).map((row) => row.id).filter((id) => !incomingIds.has(id));
      if (deleteIds.length) {
        const { error } = await admin.from("courier_routing_rules").delete().eq("shop_id", shopId).in("id", deleteIds);
        if (error) throw error;
      }

      for (const [index, rule] of input.rules.entries()) {
        const payload = {
          shop_id: shopId,
          shipping_method_pattern: rule.shipping_method_pattern,
          match_type: rule.match_type,
          courier_config_id: rule.courier_config_id,
          priority: rule.priority || index + 1,
          enabled: rule.enabled
        };

        if (rule.id) {
          const { error } = await admin
            .from("courier_routing_rules")
            .update(payload)
            .eq("id", rule.id)
            .eq("shop_id", shopId);
          if (error) throw error;
        } else {
          const { error } = await admin.from("courier_routing_rules").insert(payload);
          if (error) throw error;
        }
      }
    }

    const { data: shop } = await admin
      .from("shops")
      .select("organization_id,redispatch_enabled,shipping_method_routing_enabled")
      .eq("id", shopId)
      .single();

    if (shop) {
      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action: "shipping_routing.updated",
        entity_type: "shop",
        entity_id: shopId,
        metadata: {
          redispatch_enabled: shop.redispatch_enabled,
          shipping_method_routing_enabled: shop.shipping_method_routing_enabled,
          rules_changed: input.rules !== undefined
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

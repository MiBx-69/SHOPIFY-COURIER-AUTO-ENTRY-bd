import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(1).max(100).optional(),
  credentials: z.record(z.string().min(1)).optional()
});

/** PATCH /api/couriers/[id] — update enabled state, priority, or replace credentials */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const { data: config } = await admin
      .from("courier_configs")
      .select("id,shop_id,couriers(provider,display_name)")
      .eq("id", id)
      .single();

    if (!config) return NextResponse.json({ error: "Courier configuration not found" }, { status: 404 });

    const shopId = config.shop_id;
    const courierMeta = config.couriers as unknown as { provider: string; display_name: string };
    const provider = courierMeta.provider as "redx" | "pathao" | "steadfast";

    const { user } = await requireShopPermission(shopId, "manage_couriers");

    const input = patchSchema.parse(await request.json());

    // Validate new credentials before touching the DB
    if (input.credentials) {
      courierRegistry.get(provider).validateConfig(input.credentials);
    }

    const updates: Record<string, unknown> = {};
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.credentials) {
      updates.credentials_last_updated_at = new Date().toISOString();
      // Reset connection status when creds replaced — user must re-test
      updates.connection_status = "not_configured";
      updates.last_error_message = null;
    }

    const { data: updated, error } = await admin
      .from("courier_configs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !updated) throw error ?? new Error("Could not update courier configuration");

    // Upsert encrypted credentials if provided
    if (input.credentials) {
      const encrypted = encryptSecret(input.credentials);
      await admin.from("courier_secrets").upsert({
        courier_config_id: id,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag
      });

      // Invalidate any persisted OAuth token so next request forces a fresh grant
      if (provider === "pathao") {
        const { PathaoProvider } = await import("@/services/courier/providers");
        await new PathaoProvider().invalidateToken(id);
      }
    }

    // Audit log
    const { data: shop } = await admin.from("shops").select("organization_id").eq("id", shopId).single();
    if (shop) {
      const action = input.credentials
        ? `${provider}.credentials_replaced`
        : input.enabled === false
          ? `${provider}.disabled`
          : input.enabled === true
            ? `${provider}.enabled`
            : `${provider}.updated`;

      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action,
        entity_type: "courier_config",
        entity_id: id,
        // Never log credential values — only safe metadata
        metadata: {
          provider,
          display_name: courierMeta.display_name,
          credentials_replaced: Boolean(input.credentials),
          enabled: input.enabled
        }
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return apiError(error);
  }
}

/** DELETE /api/couriers/[id] — remove courier config and its encrypted secrets */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const { data: config } = await admin
      .from("courier_configs")
      .select("id,shop_id,couriers(provider,display_name)")
      .eq("id", id)
      .single();

    if (!config) return NextResponse.json({ error: "Courier configuration not found" }, { status: 404 });

    const shopId = config.shop_id;
    const courierMeta = config.couriers as unknown as { provider: string; display_name: string };
    const { user } = await requireShopPermission(shopId, "manage_couriers");

    // Null-out FK in dispatches so the row can be deleted without violating the constraint.
    // Historical dispatch records are preserved — they just lose the courier link.
    await admin
      .from("dispatches")
      .update({ courier_config_id: null })
      .eq("courier_config_id", id);

    // Secrets are cascade-deleted by the FK constraint
    const { error } = await admin.from("courier_configs").delete().eq("id", id);
    if (error) throw error;

    // Audit log
    const { data: shop } = await admin.from("shops").select("organization_id").eq("id", shopId).single();
    if (shop) {
      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action: `${courierMeta.provider}.removed`,
        entity_type: "courier_config",
        entity_id: id,
        metadata: { provider: courierMeta.provider, display_name: courierMeta.display_name }
      });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return apiError(error);
  }
}

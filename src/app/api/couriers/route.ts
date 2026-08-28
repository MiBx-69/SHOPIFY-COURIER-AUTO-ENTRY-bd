import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { courierConfigSchema } from "@/lib/validation/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";

/**
 * PATCH /api/couriers?shopId=<uuid>
 * Creates or updates a courier_config row for the given shop + courier.
 * If credentials are supplied they are validated then AES-256-GCM encrypted
 * before being stored — raw values are never persisted.
 */
export async function PATCH(request: NextRequest) {
  try {
    const shopId = request.nextUrl.searchParams.get("shopId");
    if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });

    const { user } = await requireShopPermission(shopId, "manage_couriers");

    const input = courierConfigSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: courier } = await admin
      .from("couriers")
      .select("provider,display_name")
      .eq("id", input.courierId)
      .single();

    if (!courier) return NextResponse.json({ error: "Courier not found" }, { status: 404 });

    // Validate credential fields per provider before touching the DB
    if (input.credentials) {
      courierRegistry.get(courier.provider).validateConfig(input.credentials);
    }

    // Determine priority
    let finalPriority = input.priority;
    if (finalPriority !== undefined) {
      // Check if priority already exists for another courier
      const { data: existing } = await admin
        .from("courier_configs")
        .select("id")
        .eq("shop_id", shopId)
        .eq("priority", finalPriority)
        .neq("courier_id", input.courierId)
        .maybeSingle();
      
      if (existing) {
        // Find max priority and add 1
        const { data: maxPri } = await admin
          .from("courier_configs")
          .select("priority")
          .eq("shop_id", shopId)
          .order("priority", { ascending: false })
          .limit(1)
          .single();
        finalPriority = (maxPri?.priority || 0) + 1;
      }
    } else {
      // If no priority provided, put at the end
      const { data: maxPri } = await admin
        .from("courier_configs")
        .select("priority")
        .eq("shop_id", shopId)
        .order("priority", { ascending: false })
        .limit(1)
        .single();
      finalPriority = (maxPri?.priority || 0) + 1;
    }

    const { data: config, error } = await admin
      .from("courier_configs")
      .upsert(
        {
          shop_id: shopId,
          courier_id: input.courierId,
          enabled: input.enabled,
          priority: finalPriority,
          // Reset health when credentials change so user must re-test
          ...(input.credentials && {
            credentials_last_updated_at: new Date().toISOString(),
            connection_status: "not_configured",
            last_error_message: null
          })
        },
        { onConflict: "shop_id,courier_id" }
      )
      .select()
      .single();

    if (error || !config) throw error ?? new Error("Could not save courier configuration");

    // Upsert encrypted credentials if provided — never store plaintext
    if (input.credentials) {
      const encrypted = encryptSecret(input.credentials);
      await admin.from("courier_secrets").upsert({
        courier_config_id: config.id,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag
      });
    }

    // Audit log — safe metadata only, no credential values
    const { data: shop } = await admin
      .from("shops")
      .select("organization_id")
      .eq("id", shopId)
      .single();

    if (shop) {
      await admin.from("audit_logs").insert({
        organization_id: shop.organization_id,
        shop_id: shopId,
        actor_id: user.id,
        action: input.credentials
          ? `${courier.provider}.credentials_configured`
          : `${courier.provider}.updated`,
        entity_type: "courier_config",
        entity_id: config.id,
        metadata: {
          provider: courier.provider,
          display_name: courier.display_name,
          enabled: input.enabled,
          credentials_provided: Boolean(input.credentials)
        }
      });
    }

    return NextResponse.json({ data: config });
  } catch (error) {
    return apiError(error);
  }
}

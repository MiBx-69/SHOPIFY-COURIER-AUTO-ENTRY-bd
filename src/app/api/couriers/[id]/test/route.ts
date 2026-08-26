import { NextRequest, NextResponse } from "next/server";
import { apiError, requireShopPermission } from "@/lib/api/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/security/crypto";
import { courierRegistry } from "@/services/courier/registry";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startMs = Date.now();

  try {
    const { id } = await params;
    const admin = createAdminClient();

    // Load config — must exist before auth check so we can determine shop
    const { data: config } = await admin
      .from("courier_configs")
      .select("id,shop_id,couriers(provider,display_name)")
      .eq("id", id)
      .single();

    if (!config) {
      return NextResponse.json({ error: "Courier configuration not found" }, { status: 404 });
    }

    const shopId = config.shop_id;
    const courierMeta = config.couriers as unknown as { provider: string; display_name: string };
    const provider = courierMeta.provider as "redx" | "pathao" | "steadfast";
    const displayName = courierMeta.display_name;

    // Auth check
    const { user } = await requireShopPermission(shopId, "manage_couriers");

    // Load encrypted credentials
    const { data: secret } = await admin
      .from("courier_secrets")
      .select("ciphertext,iv,auth_tag")
      .eq("courier_config_id", id)
      .single();

    if (!secret) {
      await admin.from("courier_configs").update({
        connection_status: "not_configured",
        last_tested_at: new Date().toISOString(),
        last_error_message: "No credentials have been configured yet"
      }).eq("id", id);
      return NextResponse.json({ error: "Credentials are not configured" }, { status: 400 });
    }

    // Decrypt server-side — never return decrypted values
    const credentials = decryptSecret({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.auth_tag
    });

    // Run provider test — catch and record failure separately
    let testError: string | null = null;
    try {
      await courierRegistry.get(provider).testConnection(credentials);
    } catch (err) {
      testError = err instanceof Error
        ? err.message.replace(/token|secret|key|password|credential/gi, "[REDACTED]")
        : "Connection test failed";
    }

    const latencyMs = Date.now() - startMs;
    const testedAt = new Date().toISOString();

    // Persist health metadata
    await admin.from("courier_configs").update({
      connection_status: testError ? "failed" : "connected",
      last_tested_at: testedAt,
      last_test_latency_ms: latencyMs,
      last_error_message: testError
    }).eq("id", id);

    // Audit log — no credential values in metadata
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
        action: `${provider}.connection_tested`,
        entity_type: "courier_config",
        entity_id: id,
        metadata: {
          provider,
          display_name: displayName,
          result: testError ? "failed" : "connected",
          latency_ms: latencyMs
        }
      });
    }

    if (testError) {
      return NextResponse.json({
        error: `${displayName} connection test failed`,
        data: { connected: false, provider, displayName, latencyMs, testedAt }
      }, { status: 400 });
    }

    return NextResponse.json({
      data: { connected: true, provider, displayName, latencyMs, testedAt }
    });
  } catch (error) {
    return apiError(error);
  }
}

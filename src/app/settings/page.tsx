import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopifyCard } from "@/features/settings/shopify-card";
import { ShopifyConnect } from "@/features/settings/shopify-connect";
import { PasskeyManager } from "@/features/settings/passkey-manager";
import { CourierSettings, type CourierConfig } from "@/features/settings/courier-settings";
import { IntegrationAuditLog } from "@/features/settings/integration-audit-log";

export const metadata = { title: "Settings — Dispatch Platform" };

export default async function SettingsPage() {
  // Auth: use SSR client to get verified user identity
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Privileged data fetch via admin client (bypasses RLS where needed for settings)
  const admin = createAdminClient();

  // Fetch shops this user belongs to (RLS on shops respects membership)
  const { data: shops } = await supabase
    .from("shops")
    .select("id,name,shop_domain,connection_status,last_synced_at")
    .limit(1);

  const shop = shops?.[0] ?? null;

  // Fetch full installation details (admin client — shopify_installations is not RLS-exposed to auth)
  let installation: {
    scopes: string[];
    api_version: string | null;
    last_tested_at: string | null;
    last_test_status: string | null;
    last_error_message: string | null;
  } | null = null;

  if (shop) {
    const { data } = await admin
      .from("shopify_installations")
      .select("scopes,api_version,last_tested_at,last_test_status,last_error_message")
      .eq("shop_id", shop.id)
      .maybeSingle();
    installation = data;
  }

  // Fetch courier configs with health fields
  const courierConfigs: CourierConfig[] = [];
  if (shop) {
    const { data: configs } = await supabase
      .from("courier_configs")
      .select(`
        id,enabled,priority,connection_status,
        last_tested_at,last_test_latency_ms,last_error_message,
        credentials_last_updated_at,courier_id,
        couriers(provider,display_name)
      `)
      .eq("shop_id", shop.id)
      .order("priority");

    courierConfigs.push(...((configs ?? []) as unknown as CourierConfig[]));
  }

  // Fetch all available courier providers for the "add" flow
  const { data: allCouriers } = await supabase
    .from("couriers")
    .select("id,provider,display_name")
    .order("display_name");

  const shopWithInstallation = shop
    ? { ...shop, shopify_installations: installation }
    : null;

  return (
    <AppShell active="Settings">
      <header className="mb-6">
        <p className="text-sm font-semibold text-slate-500">Workspace</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
      </header>

      <div className="space-y-8">
        {/* ── Shopify Integration ────────────────────────────────────────── */}
        <section>
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900">Shopify</h2>
            <p className="text-sm text-slate-500">
              Manage your connected Shopify store.
            </p>
          </div>
          {shopWithInstallation ? (
            <ShopifyCard shop={shopWithInstallation} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6">
              <p className="text-sm font-semibold text-slate-800">No Shopify store connected</p>
              <p className="mt-1 text-sm text-slate-500">
                Connect through Shopify OAuth — you never paste an Admin API token here.
              </p>
              <div className="mt-4">
                <ShopifyConnect />
              </div>
            </div>
          )}
        </section>

        {/* ── Courier Integrations ───────────────────────────────────────── */}
        {shop && (
          <section>
            <div className="mb-3">
              <h2 className="text-base font-bold text-slate-900">Courier services</h2>
              <p className="text-sm text-slate-500">
                Credentials are encrypted with AES-256-GCM before storage and never returned to the browser.
              </p>
            </div>
            <CourierSettings
              shopId={shop.id}
              configs={courierConfigs}
              allCouriers={(allCouriers ?? []) as { id: string; provider: string; display_name: string }[]}
            />
          </section>
        )}

        {/* ── Security ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-3">
            <h2 className="text-base font-bold text-slate-900">Security</h2>
            <p className="text-sm text-slate-500">
              Passkeys are the preferred sign-in method. Email remains a secure fallback.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <PasskeyManager />
          </div>
        </section>

        {/* ── Integration Audit Log ─────────────────────────────────────── */}
        {shop && (
          <section>
            <div className="mb-3">
              <h2 className="text-base font-bold text-slate-900">Integration history</h2>
              <p className="text-sm text-slate-500">
                Recent credential and connection events for this store. No credential values are stored here.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <IntegrationAuditLog shopId={shop.id} />
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

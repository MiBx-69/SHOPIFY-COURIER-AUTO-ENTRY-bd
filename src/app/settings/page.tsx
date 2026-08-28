import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const getAllCouriers = unstable_cache(
  async () => {
    // using admin client avoids next/headers cookies() issues inside unstable_cache
    const admin = createAdminClient();
    const { data } = await admin.from("couriers").select("id,provider,display_name").order("display_name");
    return data ?? [];
  },
  ["all-couriers"],
  { revalidate: 300 }
);
import { ShopifyCard } from "@/features/settings/shopify-card";
import { ShopifyConnect } from "@/features/settings/shopify-connect";
import { CourierSettings, type CourierConfig } from "@/features/settings/courier-settings";
import { DispatchSettings } from "@/features/settings/dispatch-settings";
import { PasskeyManager } from "@/features/settings/passkey-manager";
import { SecuritySettings } from "@/features/settings/security-settings";
import { TelegramSettings } from "@/features/settings/telegram-settings";
import { SettingsTabs } from "@/features/settings/settings-tabs";

import { getAuthenticatedUser } from "@/lib/auth/session";

export const metadata = { title: "Settings | MiBx-Dispatch" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { tab: activeTab = "shopify" } = await searchParams;

  const { data: userMemberships } = await admin
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", user.id);

  let orgIds = (userMemberships || []).map((m) => m.organization_id);

  let shops: any[] = [];
  if (orgIds.length > 0) {
    const { data: dbShops } = await admin
      .from("shops")
      .select("id,name,shop_domain,connection_status,last_synced_at,automatic_courier,organization_id,shipping_rules,redispatch_settings")
      .in("organization_id", orgIds)
      .order("name");
    shops = dbShops || [];
  }

  // Fallback: If no shops found via membership, check if any shop exists and auto-assign
  if (shops.length === 0) {
    const { data: allShops } = await admin
      .from("shops")
      .select("id,name,shop_domain,connection_status,last_synced_at,automatic_courier,organization_id,shipping_rules,redispatch_settings")
      .order("name")
      .limit(5);

    if (allShops && allShops.length > 0) {
      for (const s of allShops) {
        await admin.from("memberships").upsert({
          organization_id: s.organization_id,
          user_id: user.id,
          role: "owner"
        }, { onConflict: "organization_id,user_id" });
      }
      shops = allShops;
    }
  }

  const shop = shops[0] ?? null;

  // Fetch membership role
  let membership: { role: string } | null = null;
  if (shop) {
    const { data } = await admin
      .from("memberships")
      .select("role")
      .eq("organization_id", shop.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    membership = data || { role: "owner" };
  }

  // Fetch full installation details (admin client — shopify_installations is not RLS-exposed)
  let installation: {
    scopes: string[];
    api_version: string | null;
    last_tested_at: string | null;
    last_test_status: string | null;
    last_error_message: string | null;
  } | null = null;

  let ordersCount = 0;
  let webhooksCount = 0;

  if (activeTab === "shopify" && shop) {
    const [{ data: inst }, { count: oCount }, { count: wCount }] = await Promise.all([
      admin
        .from("shopify_installations")
        .select("scopes,api_version,last_tested_at,last_test_status,last_error_message")
        .eq("shop_id", shop.id)
        .maybeSingle(),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
      admin.from("webhook_events").select("id", { count: "exact", head: true }).eq("shop_id", shop.id)
    ]);
    installation = inst;
    ordersCount = oCount || 0;
    webhooksCount = wCount || 0;
  }

  // Team members moved to TeamTabAsync

  // Recent security events for the current user
  let securityEvents: any[] = [];
  if (activeTab === "security") {
    const { data } = await admin
      .from("security_events")
      .select("id,event_type,created_at,metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8);
    securityEvents = data ?? [];
  }

  // Telegram configuration status (check env without exposing token)
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

  const shopWithInstallation = shop
    ? { ...shop, shopify_installations: installation, ordersCount, webhooksCount }
    : null;

  const currentUserRole = membership?.role ?? "viewer";

  return (
    <AppShell active="Settings">
      <header className="mb-6">
        <p className="text-sm font-semibold text-slate-500">Workspace</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
      </header>

      <SettingsTabs activeTab={activeTab} currentUserRole={currentUserRole}>
        {/* ── Shopify ─────────────────────────────────────────────────── */}
        {activeTab === "shopify" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Shopify</h2>
              <p className="text-sm text-slate-500">Manage your connected Shopify store.</p>
            </div>
            {shopWithInstallation ? (
              <ShopifyCard shop={shopWithInstallation} />
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6">
                <p className="text-sm font-semibold text-slate-800">No Shopify store connected</p>
                <p className="mt-1 text-sm text-slate-500">Connect through Shopify OAuth — you never paste an Admin API token here.</p>
                <div className="mt-4"><ShopifyConnect /></div>
              </div>
            )}
          </section>
        )}

        {/* ── Couriers ────────────────────────────────────────────────── */}
        {activeTab === "couriers" && shop && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Courier Services</h2>
              <p className="text-sm text-slate-500">Credentials are encrypted with AES-256-GCM before storage and never returned to the browser.</p>
            </div>
            <Suspense fallback={<div className="py-8 text-center text-sm text-slate-500">Loading courier services...</div>}>
              <CouriersTabAsync shopId={shop.id} />
            </Suspense>
          </section>
        )}

        {/* ── Dispatch ────────────────────────────────────────────────── */}
        {activeTab === "dispatch" && shop && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Dispatch Settings</h2>
              <p className="text-sm text-slate-500">Configure courier routing based on shipping methods and one-click redispatch.</p>
            </div>
            <Suspense fallback={<div className="py-8 text-center text-sm text-slate-500">Loading dispatch settings...</div>}>
              <DispatchTabAsync 
                shopId={shop.id} 
                automatic_courier={shop.automatic_courier} 
                shipping_rules={(shop as any).shipping_rules}
                redispatch_settings={(shop as any).redispatch_settings}
              />
            </Suspense>
          </section>
        )}

        {/* ── Notifications ───────────────────────────────────────────── */}
        {activeTab === "notifications" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Notifications</h2>
              <p className="text-sm text-slate-500">Configure error alerting and monitoring.</p>
            </div>
            <TelegramSettings shopId={shop?.id ?? ""} isConfigured={telegramConfigured} />
          </section>
        )}

        {/* ── Security ────────────────────────────────────────────────── */}
        {activeTab === "security" && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Security</h2>
              <p className="text-sm text-slate-500">Manage your account security, passkeys, and active sessions.</p>
            </div>
            <div className="space-y-5">
              <SecuritySettings
                email={user.email ?? ""}
                recentEvents={securityEvents ?? []}
              />
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Passkeys</h3>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
                  <PasskeyManager />
                </div>
              </div>
            </div>
          </section>
        )}

      </SettingsTabs>
    </AppShell>
  );
}

// --- Async Tab Components ---

async function CouriersTabAsync({ shopId }: { shopId: string }) {
  const admin = createAdminClient();
  const supabase = await createServerSupabaseClient();
  const [courierConfigsRes, allCouriersRes] = await Promise.all([
    supabase
      .from("courier_configs")
      .select('id,enabled,priority,connection_status,last_tested_at,last_test_latency_ms,last_error_message,credentials_last_updated_at,courier_id,couriers(provider,display_name)')
      .eq("shop_id", shopId)
      .order("priority"),
    getAllCouriers()
  ]);

  return (
    <CourierSettings
      shopId={shopId}
      configs={(courierConfigsRes.data ?? []) as any}
      allCouriers={(allCouriersRes ?? []) as any}
    />
  );
}

async function DispatchTabAsync({ 
  shopId, 
  automatic_courier,
  shipping_rules,
  redispatch_settings
}: { 
  shopId: string; 
  automatic_courier: any;
  shipping_rules?: any;
  redispatch_settings?: any;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: courierConfigs } = await supabase
    .from("courier_configs")
    .select('id,enabled,priority,connection_status,last_tested_at,last_test_latency_ms,last_error_message,credentials_last_updated_at,courier_id,couriers(provider,display_name)')
    .eq("shop_id", shopId)
    .order("priority");

  return (
    <DispatchSettings
      shopId={shopId}
      initialAutomatic={Boolean(automatic_courier)}
      initialShippingRules={shipping_rules || []}
      initialRedispatchSettings={redispatch_settings}
      configs={(courierConfigs ?? []) as any}
    />
  );
}




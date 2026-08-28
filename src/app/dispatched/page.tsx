import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderList } from "@/features/orders/order-list";

export const metadata = { title: "Dispatched | MiBx-Dispatch" };

export default async function DispatchedPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: userMemberships } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);

  const orgIds = (userMemberships || []).map((m: { organization_id: string }) => m.organization_id);

  let shops: any[] = [];
  if (orgIds.length > 0) {
    const { data: dbShops } = await admin
      .from("shops")
      .select("id,name,shop_domain,automatic_courier,shipping_rules,redispatch_settings")
      .in("organization_id", orgIds)
      .order("name");
    shops = dbShops || [];
  }

  // Fallback: If no shops found via membership, check all shops and auto-assign
  if (shops.length === 0) {
    const { data: allShops } = await admin
      .from("shops")
      .select("id,name,shop_domain,automatic_courier,shipping_rules,redispatch_settings,organization_id")
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
  const { shop: requested } = await searchParams;
  const shop = shops?.find((item) => item.id === requested) || shops?.[0];

  let couriers: Array<{ id: string; name: string; provider?: string }> = [];
  if (shop) {
    const { data: configs } = await supabase
      .from("courier_configs")
      .select("id,couriers(provider,display_name)")
      .eq("shop_id", shop.id)
      .eq("enabled", true)
      .order("priority");
    couriers = (configs || []).map((c: any) => ({
      id: c.id,
      name: c.couriers?.display_name || "Courier",
      provider: c.couriers?.provider
    }));
  }

  return (
    <AppShell active="Dispatched">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Dispatched</h1>
          {shop && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {shop.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {shops && shops.length > 1 && (
            <select 
              aria-label="Select store" 
              defaultValue={shop?.id} 
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
            >
              {shops.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          )}
          <Link 
            href="/settings"
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Settings size={13} />
            <span className="hidden sm:inline">Settings</span>
          </Link>
        </div>
      </div>

      {shop ? (
        <OrderList 
          shopId={shop.id} 
          mode="dispatched"
          initialStatus="dispatched" 
          availableCouriers={couriers}
          automaticCourier={Boolean(shop.automatic_courier)}
          shippingRules={(shop as any).shipping_rules}
          redispatchSettings={(shop as any).redispatch_settings}
        />
      ) : (
        <div className="rounded-lg bg-white p-8 text-center border border-slate-200 shadow-2xs">
          <h2 className="font-semibold text-sm text-slate-900">Connect a Shopify store</h2>
          <p className="mt-1 text-xs text-slate-500">Connect your store in Settings to track and manage dispatched orders.</p>
          <Link href="/settings" className="mt-3 inline-block rounded-md bg-slate-900 px-3.5 py-2 text-xs font-medium text-white shadow-2xs hover:bg-slate-800">
            Open Settings
          </Link>
        </div>
      )}
    </AppShell>
  );
}

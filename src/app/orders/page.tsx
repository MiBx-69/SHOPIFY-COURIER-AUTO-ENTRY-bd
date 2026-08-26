import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrderList } from "@/features/orders/order-list";
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: shops } = await supabase.from("shops").select("id,name,shop_domain,automatic_courier").order("name");
  const { shop: requested } = await searchParams;
  const shop = shops?.find((item) => item.id === requested) || shops?.[0];

  let couriers: Array<{ id: string; name: string }> = [];
  if (shop) {
    const { data: configs } = await supabase
      .from("courier_configs")
      .select("id,couriers(display_name)")
      .eq("shop_id", shop.id)
      .eq("enabled", true)
      .order("priority");
    couriers = (configs || []).map((c: any) => ({
      id: c.id,
      name: c.couriers.display_name
    }));
  }

  return (
    <AppShell active="Orders">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{shop?.name || "No store connected"}</p>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        </div>
        <Link className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white" href="/settings">Settings</Link>
      </header>
      {shops && shops.length > 1 && (
        <select aria-label="Select store" defaultValue={shop?.id} onChange={() => {}} className="mb-4 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
          <option value={shop?.id}>{shop?.name}</option>
          {shops.filter((item) => item.id !== shop?.id).map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      )}
      {shop ? (
        <OrderList 
          shopId={shop.id} 
          automaticCourier={Boolean(shop.automatic_courier)} 
          availableCouriers={couriers} 
        />
      ) : (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
          <h2 className="font-bold">Connect a Shopify store</h2>
          <p className="mt-1 text-sm text-slate-500">Install the app from Shopify to bring real orders into Dispatch.</p>
          <Link href="/settings" className="mt-4 inline-block rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Connect Shopify</Link>
        </div>
      )}
    </AppShell>
  );
}

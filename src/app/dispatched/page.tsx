import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrderList } from "@/features/orders/order-list";

export const metadata = { title: "Dispatched | MiBx-Dispatch" };

export default async function DispatchedPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: shops } = await supabase.from("shops").select("id,name").limit(1);
  const shop = shops?.[0];

  return (
    <AppShell active="Dispatched">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Dispatched History</h1>
          {shop && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {shop.name}
            </span>
          )}
        </div>
      </div>
      {shop ? (
        <OrderList shopId={shop.id} initialStatus="dispatched" />
      ) : (
        <p className="rounded-lg bg-white p-6 text-xs text-slate-500 border border-slate-200 shadow-2xs">
          Connect a Shopify store to view dispatch history.
        </p>
      )}
    </AppShell>
  );
}

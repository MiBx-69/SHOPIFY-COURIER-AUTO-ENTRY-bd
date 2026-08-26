import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OrderList } from "@/features/orders/order-list";
export default async function DispatchedPage() { const supabase = await createServerSupabaseClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login"); const { data: shops } = await supabase.from("shops").select("id,name").limit(1); return <AppShell active="Dispatched"><header className="mb-5"><p className="text-sm font-semibold text-slate-500">{shops?.[0]?.name || "No store"}</p><h1 className="text-2xl font-bold tracking-tight">Dispatched</h1></header>{shops?.[0] ? <OrderList shopId={shops[0].id} initialStatus="dispatched"/> : <p className="rounded-2xl bg-white p-6 text-sm text-slate-500">Connect a Shopify store to view dispatch history.</p>}</AppShell>; }

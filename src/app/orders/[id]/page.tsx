import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, MapPin, Truck, Package, Clock } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import { 
  FulfillmentBadge, 
  PaymentBadge, 
  DispatchBadge 
} from "@/components/ui/status-badge";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { data: order } = await supabase
    .from("orders")
    .select("*,order_line_items(*),dispatches(*,courier_configs(couriers(provider,display_name)))")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const address = Object.values(order.shipping_address || {}).filter(Boolean).join(", ");
  const dispatch = order.dispatches?.[0];
  const courierName = dispatch?.courier_configs?.couriers?.display_name || dispatch?.courier_configs?.couriers?.provider;
  const isCancelled = Boolean(order.cancelled_at);
  const fulfillmentStatus = isCancelled ? "CANCELLED" : (order.fulfillment_status || "UNFULFILLED");

  return (
    <AppShell active="Orders">
      {/* Top Breadcrumb */}
      <div className="mb-3">
        <Link 
          href="/orders" 
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft size={13} />
          Back to Orders
        </Link>
      </div>

      {/* Header Banner */}
      <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-mono tracking-tight text-slate-900">{order.name}</h1>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500 font-mono">{new Date(order.shopify_updated_at).toLocaleString()}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <FulfillmentBadge status={fulfillmentStatus} />
              <PaymentBadge status={order.financial_status} />
              <DispatchBadge status={order.dispatch_status} tracking={dispatch?.tracking_id} />
            </div>
          </div>
          <div className="sm:text-right">
            <span className="text-base font-bold text-slate-900">
              {money(order.total_minor, order.currency)}
            </span>
          </div>
        </div>
      </header>

      {/* 2-Column Details Grid */}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {/* Customer & Delivery */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs space-y-3">
          <div>
            <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1">
              <User size={13} className="text-slate-400" />
              Customer
            </div>
            <p className="font-medium text-slate-800">{order.customer_name || "—"}</p>
            <p className="text-slate-500 font-mono mt-0.5">{order.customer_phone || "No phone provided"}</p>
            <p className="text-slate-500 mt-0.5">{order.customer_email || "No email provided"}</p>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1">
              <MapPin size={13} className="text-slate-400" />
              Shipping Address
            </div>
            <p className="text-slate-600 leading-relaxed">{address || "No shipping address provided"}</p>
          </div>
        </section>

        {/* Courier & Dispatch Info */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs space-y-3">
          <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-1">
            <Truck size={13} className="text-slate-400" />
            Dispatch & Fulfillment
          </div>

          {dispatch ? (
            <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-md border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Courier:</span>
                <span className="font-semibold text-slate-800">{courierName || "Assigned Courier"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tracking Number:</span>
                <span className="font-mono font-semibold text-slate-900">{dispatch.tracking_id || "Pending"}</span>
              </div>
              {dispatch.courier_status && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Courier Status:</span>
                  <span className="text-slate-700">{dispatch.courier_status}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-100">
              This order has not been dispatched to a courier yet.
            </p>
          )}

          {order.note && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-slate-500 font-semibold block mb-0.5">Order Note:</span>
              <p className="text-slate-700 italic bg-amber-50/50 p-2 rounded border border-amber-100/60">{order.note}</p>
            </div>
          )}
        </section>

        {/* Order Line Items */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs md:col-span-2">
          <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-3">
            <Package size={13} className="text-slate-400" />
            Line Items ({order.order_line_items.length})
          </div>

          <div className="divide-y divide-slate-100 border border-slate-100 rounded-md overflow-hidden">
            {order.order_line_items.map((item: { 
              id: string; 
              title: string; 
              variant_title: string | null; 
              sku: string | null; 
              quantity: number; 
              total_price_minor: number 
            }) => (
              <div key={item.id} className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50/50 transition-colors">
                <div className="min-w-0 flex-1 pr-4">
                  <p className="font-medium text-slate-800">{item.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {item.variant_title ? `${item.variant_title} · ` : ""}
                    {item.sku ? <span className="font-mono">SKU: {item.sku} · </span> : ""}
                    <span>Qty: {item.quantity}</span>
                  </p>
                </div>
                <div className="font-semibold text-slate-900 whitespace-nowrap">
                  {money(item.total_price_minor, order.currency)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

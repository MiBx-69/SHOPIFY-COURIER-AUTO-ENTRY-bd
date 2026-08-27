import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, MapPin, Truck, Package, Clock, History, Activity, Tag } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { money } from "@/lib/utils";
import { 
  FulfillmentBadge, 
  PaymentBadge, 
  DispatchBadge
} from "@/components/ui/status-badge";
import { OrderSyncButton } from "@/features/orders/order-sync-button";
import { CustomerActions, CopyButton } from "@/components/ui/copy-actions";

type DispatchAttempt = {
  id: string;
  provider: string;
  status: string;
  error_code: string | null;
  safe_error_message: string | null;
  started_at: string;
  completed_at: string | null;
  request_metadata?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
};

type OrderEvent = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: order } = await supabase.from("orders").select("name").eq("id", id).maybeSingle();
  return {
    title: order?.name ? `Order ${order.name} | MiBx-Dispatch` : "Order Details | MiBx-Dispatch"
  };
}

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [orderRes, eventsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*,order_line_items(*),dispatches(*,courier_configs(couriers(provider,display_name)),dispatch_attempts(*),courier_shipments(*,courier_tracking_events(*)))")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_events")
      .select("*")
      .eq("order_id", id)
      .order("occurred_at", { ascending: false })
  ]);

  const order = orderRes.data;
  if (!order) notFound();

  const events: OrderEvent[] = eventsRes.data || [];
  const address = Object.values(order.shipping_address || {}).filter(Boolean).join(", ");
  const dispatch = order.dispatches?.[0];
  const attempts: DispatchAttempt[] = dispatch?.dispatch_attempts || [];
  const courierName = dispatch?.courier_configs?.couriers?.display_name || dispatch?.courier_configs?.couriers?.provider;
  const isCancelled = Boolean(order.cancelled_at);
  const fulfillmentStatus = isCancelled ? "CANCELLED" : (order.fulfillment_status || "UNFULFILLED");

  // Check if order is currently skipped
  const isSkipped = events.length > 0 && events[0].event_type === "dispatch_skipped";

  // Pickup location information from dispatch events or attempts
  const dispatchEvent = events.find((e) => e.event_type === "order_dispatched");
  const successfulAttempt = attempts.find((a) => a.status === "success");
  const pickupLocationName = (dispatchEvent?.payload?.pickup_location_name as string) || 
    (successfulAttempt?.request_metadata?.pickup_location_name as string);
  const pickupAddress = (dispatchEvent?.payload?.pickup_address as string) || 
    (successfulAttempt?.request_metadata?.pickup_address as string);

  // Build unified timeline
  const timeline = [
    ...(order.shopify_created_at ? [{
      title: "Order Placed in Shopify",
      time: order.shopify_created_at,
      type: "shopify",
      description: `Customer placed order ${order.name}`
    }] : []),
    ...(order.created_at ? [{
      title: "Synchronized with MiBx-Dispatch",
      time: order.created_at,
      type: "sync",
      description: "Order ingested and prepared for courier processing"
    }] : []),
    ...events.map((ev) => ({
      title: ev.event_type === "dispatch_skipped" ? "Removed from Dispatch Queue" :
             ev.event_type === "dispatch_restored" ? "Restored to Dispatch Queue" :
             ev.event_type === "dispatch_cancelled" ? "Courier Dispatch Cancelled" :
             ev.event_type === "order_dispatched" ? `Dispatched via ${(ev.payload?.provider as string)?.toUpperCase() || "Courier"}` :
             ev.event_type.replace(/_/g, " "),
      time: ev.occurred_at,
      type: "event",
      description: (ev.payload?.reason as string) || (ev.payload?.pickup_location_name ? `From: ${ev.payload.pickup_location_name}` : undefined)
    })),
    ...attempts.map((att) => ({
      title: `Dispatch Attempt: ${att.provider.toUpperCase()} (${att.status.toUpperCase()})`,
      time: att.completed_at || att.started_at,
      type: att.status === "success" ? "success" : "failed",
      description: att.safe_error_message || (att.status === "success" ? "Shipment created successfully" : "Attempt processed")
    })),
    ...(dispatch?.dispatched_at ? [{
      title: `Dispatched via ${courierName || "Courier"}`,
      time: dispatch.dispatched_at,
      type: "dispatched",
      description: dispatch.tracking_id ? `Tracking Number: ${dispatch.tracking_id}` : undefined
    }] : [])
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

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
              <span className="text-xs text-slate-500 font-mono">
                {new Date(order.shopify_created_at || order.shopify_updated_at).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <FulfillmentBadge status={fulfillmentStatus} />
              <PaymentBadge status={order.financial_status} />
              {isSkipped ? (
                <DispatchBadge status="SKIPPED" />
              ) : (
                <DispatchBadge status={order.dispatch_status} tracking={dispatch?.tracking_id} />
              )}
              <OrderSyncButton shopId={order.shop_id} />
            </div>
          </div>
          <div className="sm:text-right">
            <span className="text-lg font-bold text-slate-900">
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
            <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-2">
              <User size={13} className="text-slate-400" />
              Customer
            </div>
            <p className="font-medium text-slate-800">{order.customer_name || "—"}</p>
            <div className="mt-2 space-y-2">
              <CustomerActions
                phone={order.customer_phone}
                email={order.customer_email}
                address={address || undefined}
                trackingId={dispatch?.tracking_id}
                orderName={order.name}
              />
            </div>
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
            <div className="space-y-2 bg-slate-50/80 p-3 rounded-md border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Courier:</span>
                <span className="font-semibold text-slate-800">{courierName || "Assigned Courier"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tracking Number:</span>
                <span className="font-mono font-semibold text-slate-900">{dispatch.tracking_id || "Pending"}</span>
              </div>
              {pickupLocationName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Pickup Location:</span>
                  <span className="font-medium text-slate-800">{pickupLocationName}</span>
                </div>
              )}
              {pickupAddress && (
                <div className="flex justify-between items-start">
                  <span className="text-slate-500 shrink-0">Pickup Address:</span>
                  <span className="text-right text-slate-600 font-medium pl-2">{pickupAddress}</span>
                </div>
              )}
              {dispatch.courier_status && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500">Courier Status:</span>
                  <span className="text-slate-700 font-medium capitalize">{dispatch.courier_status}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-100">
              {isSkipped 
                ? "This order was removed from the active dispatch queue by staff."
                : "This order has not been dispatched to a courier yet."}
            </p>
          )}

          {order.note && (
            <div className="border-t border-slate-100 pt-3">
              <span className="text-slate-500 font-semibold block mb-0.5">Order Note:</span>
              <p className="text-slate-700 italic bg-amber-50/50 p-2 rounded border border-amber-100/60">{order.note}</p>
            </div>
          )}
        </section>

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
              unit_price_minor: number;
              total_price_minor: number;
              product_snapshot?: Record<string, unknown>;
            }) => {
              // Try to get product image from snapshot
              const snapshot = item.product_snapshot as Record<string, unknown> | undefined;
              const imageUrl = (snapshot?.image as Record<string, string> | undefined)?.src ||
                (snapshot?.image as Record<string, string> | undefined)?.url ||
                null;

              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50/50 transition-colors gap-3">
                  {/* Product Image */}
                  <div className="size-10 rounded-md overflow-hidden border border-slate-100 shrink-0 bg-slate-50 flex items-center justify-center">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.title}
                        className="object-cover size-full"
                        loading="lazy"
                      />
                    ) : (
                      <Package size={16} className="text-slate-300" />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 truncate">{item.title}</p>
                    {item.variant_title && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.variant_title}</p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-0.5 space-x-2">
                      {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                      <span>Qty: {item.quantity}</span>
                    </p>
                  </div>

                  {/* Pricing */}
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-slate-900">{money(item.total_price_minor, order.currency)}</p>
                    {item.quantity > 1 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {money(item.unit_price_minor, order.currency)} × {item.quantity}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order Total Breakdown */}
          <div className="mt-3 border border-slate-100 rounded-md overflow-hidden bg-slate-50/70">
            <div className="divide-y divide-slate-100 text-xs">
              {order.subtotal_minor > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-slate-700">{money(order.subtotal_minor, order.currency)}</span>
                </div>
              )}
              {order.discount_minor > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-500">Discount</span>
                  <span className="text-emerald-600">− {money(order.discount_minor, order.currency)}</span>
                </div>
              )}
              {order.shipping_minor > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-500">Shipping</span>
                  <span className="text-slate-700">{money(order.shipping_minor, order.currency)}</span>
                </div>
              )}
              {order.tax_minor > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-500">Tax</span>
                  <span className="text-slate-700">{money(order.tax_minor, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2.5 bg-white">
                <span className="font-bold text-slate-900">Total</span>
                <span className="font-bold text-slate-900">{money(order.total_minor, order.currency)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Dispatch Attempts History */}
        {attempts.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs md:col-span-2">
            <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-3">
              <History size={13} className="text-slate-400" />
              Dispatch Attempts History ({attempts.length})
            </div>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-md overflow-hidden">
              {attempts.map((att, idx) => (
                <div key={att.id} className="p-3 bg-white flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 font-mono">Attempt #{attempts.length - idx}</span>
                      <span className="font-medium uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px]">
                        {att.provider}
                      </span>
                    </div>
                    {att.safe_error_message && (
                      <p className="text-red-600 text-[11px]">{att.safe_error_message}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`font-semibold uppercase text-[10px] px-2 py-0.5 rounded ${
                      att.status === "success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}>
                      {att.status}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(att.completed_at || att.started_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Activity Timeline */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-2xs md:col-span-2">
          <div className="flex items-center gap-1.5 text-slate-900 font-semibold mb-3">
            <Activity size={13} className="text-slate-400" />
            Activity Timeline
          </div>

          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {timeline.map((item, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-6 top-1 size-2 rounded-full bg-slate-900 ring-4 ring-white" />
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.time).toLocaleString()}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-slate-600 mt-0.5">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

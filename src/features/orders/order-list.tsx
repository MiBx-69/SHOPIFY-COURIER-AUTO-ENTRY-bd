"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, Truck, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type LineItem = {
  id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  total_price_minor: number;
};

type Order = {
  id: string;
  name: string;
  order_number: number;
  customer_name: string | null;
  customer_phone: string | null;
  total_minor: number;
  currency: string;
  fulfillment_status: string | null;
  financial_status: string | null;
  dispatch_status: string;
  shopify_updated_at: string;
  cancelled_at: string | null;
  order_line_items: LineItem[];
  dispatches?: Array<{ tracking_id?: string; courier_status?: string; courier_configs?: { couriers?: { provider?: string } } }>;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "on_hold", label: "On Hold" },
  { id: "partially_fulfilled", label: "Partially Fulfilled" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "dispatched", label: "Dispatched" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" }
];

export function OrderList({ 
  shopId, 
  initialStatus = "all",
  automaticCourier = true,
  availableCouriers = []
}: { 
  shopId: string; 
  initialStatus?: string;
  automaticCourier?: boolean;
  availableCouriers?: Array<{ id: string; name: string }>;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();
  
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const size = 20;

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({
        shopId,
        filter,
        q: search,
        page: page.toString(),
        size: size.toString()
      });
      const response = await fetch(`/api/orders?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed to load orders");
      setOrders(body.data || []);
      setTotalCount(body.count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Reload when filters change
  useEffect(() => {
    setPage(0); // Reset page on filter/search change
  }, [shopId, filter, search]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [shopId, filter, search, page]);

  useEffect(() => {
    const channel = createClient()
      .channel(`orders:${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` }, () => load())
      .subscribe();
    return () => {
      createClient().removeChannel(channel);
    };
  }, [shopId]);

  async function dispatch(orderId: string, courierConfigId?: string) {
    if (!window.confirm("Confirm dispatch? A courier shipment will be created.")) return;
    setNotice("Dispatching…");
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, courierConfigId, idempotencyKey: crypto.randomUUID() })
      });
      const body = await response.json();
      setNotice(response.ok ? `Dispatched${body.data?.tracking_id ? ` · ${body.data.tracking_id}` : ""}` : body.error || "Dispatch could not be completed");
      load();
    } catch {
      setNotice("Network error during dispatch.");
    }
  }

  async function bulk() {
    if (!selected.length || !window.confirm(`Dispatch ${selected.length} selected orders?`)) return;
    setNotice("Bulk dispatch is processing…");
    const response = await fetch("/api/dispatch/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: selected })
    });
    const body = await response.json();
    const results = body.data || [];
    setNotice(`${results.filter((r: { status: string }) => r.status === "dispatched").length} dispatched · ${results.filter((r: { status: string }) => r.status !== "dispatched").length} skipped or failed`);
    setSelected([]);
    load();
  }

  const hasNextPage = (page + 1) * size < totalCount;

  return (
    <section>
      <div className="sticky top-0 z-10 -mx-4 bg-slate-50 px-4 pb-3 pt-1 md:static md:mx-0 md:px-0">
        <div className="flex gap-2">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-slate-400">
            <Search size={18} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, customer, phone"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <Button variant="secondary" aria-label="Filter" onClick={() => load()}>
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors",
                filter === f.id
                  ? "bg-slate-950 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-950 p-3 text-sm font-semibold text-white animate-in slide-in-from-top-2">
          <span>{selected.length} selected</span>
          <Button className="min-h-8 bg-white text-slate-950 hover:bg-slate-100" onClick={bulk}>
            Bulk dispatch
          </Button>
        </div>
      )}

      {notice && (
        <p role="status" className="mb-3 rounded-xl bg-sky-50 p-3 text-sm font-medium text-sky-900 border border-sky-100 animate-in fade-in">
          {notice}
        </p>
      )}

      <div className="space-y-3">
        {error ? (
          <div className="rounded-2xl bg-red-50 p-5 text-sm text-red-700 flex flex-col items-center border border-red-100">
            <AlertCircle size={24} className="mb-2" />
            <p className="font-semibold">Failed to load orders</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : loading && orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
            <RefreshCw size={24} className="mx-auto animate-spin text-slate-400 mb-2" />
            <p className="text-sm text-slate-500">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
            <div className="text-4xl mb-3">📦</div>
            <p className="font-bold text-lg text-slate-900">No matching orders</p>
            <p className="mt-1 text-sm text-slate-500">
              {search ? "No orders matched your search." : "You’re all caught up in this category."}
            </p>
          </div>
        ) : (
          orders.map((order) => {
            const tracking = order.dispatches?.[0]?.tracking_id;
            const courier = order.dispatches?.[0]?.courier_configs?.couriers?.provider;
            
            return (
              <article key={order.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-slate-300 transition-all">
                <div className="flex items-start gap-3">
                  <input
                    aria-label={`Select ${order.name}`}
                    type="checkbox"
                    checked={selectedSet.has(order.id)}
                    onChange={() =>
                      setSelected((current) =>
                        selectedSet.has(order.id)
                          ? current.filter((id) => id !== order.id)
                          : [...current, order.id]
                      )
                    }
                    className="mt-1.5 size-4 rounded border-slate-300"
                  />
                  <a href={`/orders/${order.id}`} className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 items-start">
                      <div>
                        <p className="font-bold text-slate-900 text-base">{order.name}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {order.customer_name || "No customer name"} 
                          {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{money(order.total_minor, order.currency)}</p>
                        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{order.financial_status || "PENDING"}</p>
                      </div>
                    </div>

                    {/* Products summary */}
                    <div className="mt-3 bg-slate-50 rounded-lg p-2.5">
                      {order.order_line_items?.map((item) => (
                        <div key={item.id} className="flex justify-between items-start text-xs mb-1 last:mb-0">
                          <div className="flex-1 min-w-0 pr-2">
                            <span className="font-medium text-slate-700 truncate block">{item.title}</span>
                            {item.sku && <span className="text-slate-500 font-mono">SKU: {item.sku}</span>}
                          </div>
                          <span className="text-slate-600 whitespace-nowrap">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <span className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
                        order.dispatch_status === "dispatched" ? "bg-emerald-100 text-emerald-800"
                        : order.dispatch_status === "failed" ? "bg-red-100 text-red-800"
                        : order.dispatch_status === "cancelled" ? "bg-slate-100 text-slate-600"
                        : "bg-blue-50 text-blue-700"
                      )}>
                        {order.dispatch_status.replace("_", " ")}
                      </span>
                      
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        {order.fulfillment_status || "UNFULFILLED"}
                      </span>
                      
                      {tracking && (
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white flex items-center gap-1.5">
                          {courier?.toUpperCase()} {tracking}
                        </span>
                      )}
                    </div>
                  </a>
                </div>

                {order.dispatch_status !== "dispatched" && order.dispatch_status !== "cancelled" && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {!automaticCourier && availableCouriers.length > 0 && (
                      <select 
                        id={`courier-select-${order.id}`}
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm sm:max-w-48"
                      >
                        <option value="">Select courier</option>
                        {availableCouriers.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    <Button
                      onClick={() => {
                        const selectElement = document.getElementById(`courier-select-${order.id}`) as HTMLSelectElement | null;
                        const configId = selectElement?.value;
                        if (!automaticCourier && !configId) {
                          alert("Please select a courier first.");
                          return;
                        }
                        dispatch(order.id, configId);
                      }}
                      className="flex h-10 w-full items-center justify-center gap-2"
                    >
                      <Truck size={17} />
                      Dispatch Now
                    </Button>
                  </div>
                )}
              </article>
            );
          })
        )}
        
        {totalCount > size && (
          <div className="flex items-center justify-between pt-4 pb-8">
            <Button 
              variant="secondary" 
              disabled={page === 0 || loading} 
              onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {page + 1} of {Math.ceil(totalCount / size)}
            </span>
            <Button 
              variant="secondary" 
              disabled={!hasNextPage || loading} 
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

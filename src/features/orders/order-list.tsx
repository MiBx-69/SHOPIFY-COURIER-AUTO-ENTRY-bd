"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { 
  Search, 
  RefreshCw, 
  Truck, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  X,
  Clock,
  CheckCircle2,
  Copy,
  Check
} from "lucide-react";
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
  customer_email: string | null;
  total_minor: number;
  currency: string;
  fulfillment_status: string | null;
  financial_status: string | null;
  dispatch_status: string;
  shopify_updated_at: string;
  cancelled_at: string | null;
  order_line_items: LineItem[];
  dispatches?: Array<{
    tracking_id?: string;
    courier_status?: string;
    courier_configs?: {
      couriers?: {
        provider?: string;
        display_name?: string;
      };
    };
  }>;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "pending", label: "Pending" },
  { id: "dispatched", label: "Dispatched" },
  { id: "partially_fulfilled", label: "Partial" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "on_hold", label: "On Hold" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" }
];

const PAGE_SIZES = [50, 100, 200];

function fmtShortDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFullDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

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
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [selectedCouriers, setSelectedCouriers] = useState<Record<string, string>>({});
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Total pages
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startItem = totalCount === 0 ? 0 : page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({
        shopId,
        filter,
        q: search,
        page: page.toString(),
        size: pageSize.toString()
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

  // Fetch when page, filter, search, pageSize, or shopId changes
  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [shopId, filter, search, page, pageSize]);

  // Realtime updates
  useEffect(() => {
    const channel = createClient()
      .channel(`orders:${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches", filter: `shop_id=eq.${shopId}` }, () => load())
      .subscribe();
    return () => {
      createClient().removeChannel(channel);
    };
  }, [shopId]);

  function handleSearchChange(val: string) {
    setSearch(val);
    setPage(0);
  }

  function handleFilterChange(f: string) {
    setFilter(f);
    setPage(0);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(0);
  }

  async function dispatchSingle(orderId: string, courierConfigId?: string) {
    if (!window.confirm("Confirm dispatch? A courier shipment will be created.")) return;
    setDispatchingId(orderId);
    setNotice({ text: "Dispatching order…", type: "info" });
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderId, 
          courierConfigId: courierConfigId || selectedCouriers[orderId], 
          idempotencyKey: crypto.randomUUID() 
        })
      });
      const body = await response.json();
      if (response.ok) {
        setNotice({ 
          text: `Order dispatched successfully! Tracking: ${body.data?.tracking_id || "Generated"}`, 
          type: "success" 
        });
        load();
      } else {
        setNotice({ text: body.error || "Dispatch failed", type: "error" });
      }
    } catch {
      setNotice({ text: "Network error during dispatch.", type: "error" });
    } finally {
      setDispatchingId(null);
    }
  }

  async function bulkDispatch() {
    if (!selected.length || !window.confirm(`Dispatch ${selected.length} selected orders?`)) return;
    setNotice({ text: `Processing bulk dispatch for ${selected.length} orders…`, type: "info" });
    try {
      const response = await fetch("/api/dispatch/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selected })
      });
      const body = await response.json();
      const results = body.data || [];
      const succeeded = results.filter((r: { status: string }) => r.status === "dispatched").length;
      const failed = results.filter((r: { status: string }) => r.status !== "dispatched").length;
      setNotice({ 
        text: `Bulk dispatch completed: ${succeeded} dispatched, ${failed} skipped/failed.`, 
        type: succeeded > 0 ? "success" : "error" 
      });
      setSelected([]);
      load();
    } catch {
      setNotice({ text: "Network error during bulk dispatch.", type: "error" });
    }
  }

  function toggleSelectAllPage() {
    const pageIds = orders.map(o => o.id);
    const allSelected = pageIds.every(id => selectedSet.has(id));
    if (allSelected) {
      setSelected(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelected(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  }

  function copyTrackingToClipboard(tracking: string) {
    navigator.clipboard.writeText(tracking);
    setCopiedTracking(tracking);
    setTimeout(() => setCopiedTracking(null), 2000);
  }

  const allOnPageSelected = orders.length > 0 && orders.every(o => selectedSet.has(o.id));
  const someOnPageSelected = orders.some(o => selectedSet.has(o.id)) && !allOnPageSelected;

  // Render pagination buttons (e.g. 1 2 3 ... 25)
  const paginationRange = useMemo(() => {
    const delta = 2;
    const range: (number | string)[] = [];
    for (let i = 0; i < totalPages; i++) {
      if (
        i === 0 || 
        i === totalPages - 1 || 
        (i >= page - delta && i <= page + delta)
      ) {
        range.push(i);
      } else if (range[range.length - 1] !== "...") {
        range.push("...");
      }
    }
    return range;
  }, [page, totalPages]);

  return (
    <div className="space-y-2.5">
      {/* ─── COMPACT HEADER / CONTROLS ─── */}
      <div className="flex flex-col gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
        {/* Row 1: Search & Quick Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search orders by number, customer, phone, email, SKU, tracking..."
              className="h-8.5 w-full rounded-md border border-slate-200 bg-slate-50/50 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
            />
            {search && (
              <button 
                onClick={() => handleSearchChange("")} 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            onClick={() => load()}
            disabled={loading}
            title="Refresh list"
            className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-slate-900")} />
          </button>
        </div>

        {/* Row 2: Filter Pills & Status */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5">
          <div className="flex items-center gap-1 shrink-0">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => handleFilterChange(f.id)}
                  className={cn(
                    "h-6.5 px-2.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-slate-900 text-white font-semibold shadow-2xs"
                      : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 font-medium shrink-0 pl-2">
            <span>Total: <strong className="text-slate-900 font-semibold">{totalCount.toLocaleString()}</strong> orders</span>
          </div>
        </div>
      </div>

      {/* ─── BULK SELECTION BAR ─── */}
      {selected.length > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-slate-900 px-3.5 py-2 text-xs text-white shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{selected.length} order{selected.length > 1 ? "s" : ""} selected</span>
            <button 
              onClick={() => setSelected([])}
              className="text-slate-400 hover:text-white text-[11px] underline ml-1"
            >
              Clear
            </button>
          </div>
          <Button 
            onClick={bulkDispatch}
            className="h-7 px-3 text-xs bg-white text-slate-900 hover:bg-slate-100 font-medium shadow-none rounded"
          >
            <Truck size={13} className="mr-1.5" />
            Bulk Dispatch ({selected.length})
          </Button>
        </div>
      )}

      {/* ─── STATUS NOTICE ─── */}
      {notice && (
        <div className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-xs border animate-in fade-in",
          notice.type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200",
          notice.type === "error" && "bg-red-50 text-red-800 border-red-200",
          notice.type === "info" && "bg-sky-50 text-sky-800 border-sky-200"
        )}>
          <div className="flex items-center gap-2">
            {notice.type === "success" && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
            {notice.type === "error" && <AlertCircle size={14} className="text-red-600 shrink-0" />}
            {notice.type === "info" && <Clock size={14} className="text-sky-600 shrink-0" />}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 ml-2">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ─── ERROR STATE ─── */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle size={15} className="shrink-0" />
          <span className="font-semibold">Error:</span>
          <span>{error}</span>
        </div>
      )}

      {/* ─── DESKTOP ORDERS TABLE ─── */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="w-9 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someOnPageSelected;
                  }}
                  onChange={toggleSelectAllPage}
                  className="size-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                />
              </th>
              <th className="px-2.5 py-2">Order</th>
              <th className="px-2.5 py-2">Customer</th>
              <th className="px-2.5 py-2">Items</th>
              <th className="px-2.5 py-2 text-right">Total</th>
              <th className="px-2.5 py-2">Payment</th>
              <th className="px-2.5 py-2">Fulfillment</th>
              <th className="px-2.5 py-2">Courier</th>
              <th className="px-2.5 py-2">Dispatch</th>
              <th className="px-2.5 py-2">Date</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  <RefreshCw size={18} className="mx-auto animate-spin mb-1.5" />
                  <p className="text-xs font-medium">Loading orders…</p>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-slate-500">
                  <p className="font-semibold text-slate-800">No orders found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {search ? "No orders match your search criteria." : "No orders found for this filter."}
                  </p>
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const isSelected = selectedSet.has(order.id);
                const dispatchRecord = order.dispatches?.[0];
                const tracking = dispatchRecord?.tracking_id;
                const courierName = dispatchRecord?.courier_configs?.couriers?.display_name || dispatchRecord?.courier_configs?.couriers?.provider;
                const totalItemCount = order.order_line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
                const isDispatched = order.dispatch_status === "dispatched";
                const isFailed = order.dispatch_status === "failed";
                const isCancelled = Boolean(order.cancelled_at);

                return (
                  <tr 
                    key={order.id} 
                    className={cn(
                      "hover:bg-slate-50/80 transition-colors h-[48px]",
                      isSelected && "bg-slate-50/90"
                    )}
                  >
                    {/* Select Checkbox */}
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelected(prev => 
                            isSelected ? prev.filter(id => id !== order.id) : [...prev, order.id]
                          );
                        }}
                        className="size-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* Order # */}
                    <td className="px-2.5 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                      <Link 
                        href={`/orders/${order.id}`}
                        className="hover:underline text-slate-900 font-mono flex items-center gap-1"
                      >
                        {order.name}
                      </Link>
                    </td>

                    {/* Customer */}
                    <td className="px-2.5 py-1.5 max-w-[140px] truncate text-slate-700" title={order.customer_name || "—"}>
                      <span className="font-medium truncate block">{order.customer_name || "—"}</span>
                      {order.customer_phone && (
                        <span className="text-[11px] text-slate-400 font-mono block truncate">{order.customer_phone}</span>
                      )}
                    </td>

                    {/* Items */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-600">
                      <span 
                        className="cursor-default border-b border-dotted border-slate-300"
                        title={order.order_line_items?.map(i => `${i.quantity}x ${i.title}${i.sku ? ` (${i.sku})` : ""}`).join("\n")}
                      >
                        {totalItemCount} {totalItemCount === 1 ? "item" : "items"}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-2.5 py-1.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {money(order.total_minor, order.currency)}
                    </td>

                    {/* Payment */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center text-[11px] font-medium",
                        order.financial_status === "PAID" ? "text-emerald-700" :
                        order.financial_status === "PENDING" ? "text-amber-700" :
                        order.financial_status === "REFUNDED" ? "text-slate-500 line-through" :
                        "text-slate-600"
                      )}>
                        <span className={cn(
                          "size-1.5 rounded-full mr-1.5 shrink-0",
                          order.financial_status === "PAID" ? "bg-emerald-500" :
                          order.financial_status === "PENDING" ? "bg-amber-500" :
                          "bg-slate-400"
                        )} />
                        {order.financial_status === "PAID" ? "Paid" :
                         order.financial_status === "PENDING" ? "COD" :
                         order.financial_status || "—"}
                      </span>
                    </td>

                    {/* Fulfillment */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <span className={cn(
                        "text-[11px] font-medium",
                        order.fulfillment_status === "FULFILLED" ? "text-emerald-700" :
                        order.fulfillment_status === "PARTIALLY_FULFILLED" ? "text-blue-700" :
                        "text-slate-600"
                      )}>
                        {order.fulfillment_status === "FULFILLED" ? "Fulfilled" :
                         order.fulfillment_status === "PARTIALLY_FULFILLED" ? "Partial" :
                         "Unfulfilled"}
                      </span>
                    </td>

                    {/* Courier */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                      {courierName ? (
                        <span className="font-medium text-slate-800">{courierName}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Dispatch Status & Tracking */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      {isDispatched ? (
                        <div className="flex items-center gap-1">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            Dispatched
                          </span>
                          {tracking && (
                            <button
                              onClick={() => copyTrackingToClipboard(tracking)}
                              title="Click to copy tracking ID"
                              className="group flex items-center gap-1 font-mono text-[10px] text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                            >
                              <span>{tracking}</span>
                              {copiedTracking === tracking ? (
                                <Check size={10} className="text-emerald-600" />
                              ) : (
                                <Copy size={10} className="opacity-40 group-hover:opacity-100" />
                              )}
                            </button>
                          )}
                        </div>
                      ) : isFailed ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200/60">
                          Failed
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">
                          Cancelled
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          Pending
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-[11px] text-slate-500" title={fmtFullDate(order.shopify_updated_at)}>
                      {fmtShortDate(order.shopify_updated_at)}
                    </td>

                    {/* Action Column */}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {isDispatched ? (
                        <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 size={13} />
                          Done
                        </span>
                      ) : isCancelled ? (
                        <span className="text-[11px] text-slate-400">Void</span>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {!automaticCourier && availableCouriers.length > 0 && (
                            <select
                              value={selectedCouriers[order.id] || ""}
                              onChange={(e) => setSelectedCouriers(prev => ({ ...prev, [order.id]: e.target.value }))}
                              className="h-6.5 rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-700 focus:outline-none"
                            >
                              <option value="">Courier…</option>
                              {availableCouriers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                          <button
                            onClick={() => dispatchSingle(order.id)}
                            disabled={dispatchingId === order.id}
                            className="h-6.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-medium transition-all inline-flex items-center gap-1 disabled:opacity-50 shadow-2xs cursor-pointer"
                          >
                            {dispatchingId === order.id ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <Truck size={11} />
                            )}
                            Dispatch
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── MOBILE COMPACT ORDER ROWS (md:hidden) ─── */}
      <div className="md:hidden divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white overflow-hidden shadow-2xs">
        {loading && orders.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <RefreshCw size={16} className="mx-auto animate-spin mb-1" />
            <p className="text-xs">Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <p className="font-semibold text-xs text-slate-800">No orders found</p>
          </div>
        ) : (
          orders.map((order) => {
            const isSelected = selectedSet.has(order.id);
            const dispatchRecord = order.dispatches?.[0];
            const tracking = dispatchRecord?.tracking_id;
            const courierName = dispatchRecord?.courier_configs?.couriers?.display_name || dispatchRecord?.courier_configs?.couriers?.provider;
            const totalItemCount = order.order_line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
            const isDispatched = order.dispatch_status === "dispatched";

            return (
              <div 
                key={order.id}
                className={cn(
                  "p-2.5 flex items-start gap-2.5 transition-colors",
                  isSelected && "bg-slate-50/90"
                )}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {
                    setSelected(prev => 
                      isSelected ? prev.filter(id => id !== order.id) : [...prev, order.id]
                    );
                  }}
                  className="mt-1 size-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 shrink-0"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Top row: Order Number & Total */}
                  <div className="flex items-baseline justify-between gap-2">
                    <Link 
                      href={`/orders/${order.id}`}
                      className="font-semibold font-mono text-slate-900 text-xs hover:underline flex items-center gap-1 truncate"
                    >
                      {order.name}
                    </Link>
                    <span className="font-semibold text-slate-900 text-xs shrink-0">
                      {money(order.total_minor, order.currency)}
                    </span>
                  </div>

                  {/* Middle row: Customer & Items */}
                  <div className="text-[11px] text-slate-600 truncate mt-0.5">
                    <span>{order.customer_name || "No name"}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span>{totalItemCount} item{totalItemCount !== 1 ? "s" : ""}</span>
                  </div>

                  {/* Status & Date row */}
                  <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 mt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn(
                        "font-medium",
                        order.fulfillment_status === "FULFILLED" ? "text-emerald-700" : "text-amber-700"
                      )}>
                        {order.fulfillment_status === "FULFILLED" ? "Fulfilled" : "Unfulfilled"}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className={cn(
                        "font-medium",
                        order.financial_status === "PAID" ? "text-emerald-700" : "text-amber-700"
                      )}>
                        {order.financial_status === "PAID" ? "Paid" : "COD"}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{fmtShortDate(order.shopify_updated_at)}</span>
                    </div>

                    {/* Mobile Action / Status */}
                    <div>
                      {isDispatched ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                          {tracking || "Dispatched"}
                        </span>
                      ) : (
                        <button
                          onClick={() => dispatchSingle(order.id)}
                          disabled={dispatchingId === order.id}
                          className="h-6 px-2 rounded bg-slate-900 text-white text-[10px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {dispatchingId === order.id ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : (
                            <Truck size={10} />
                          )}
                          Dispatch
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── BOTTOM PAGINATION BAR ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
        {/* Left: Summary */}
        <div className="text-slate-500 text-[11px]">
          Showing <span className="font-semibold text-slate-800">{startItem}–{endItem}</span> of <span className="font-semibold text-slate-800">{totalCount.toLocaleString()}</span> orders
        </div>

        {/* Center: Numbered Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title="Previous page"
            >
              <ChevronLeft size={14} />
            </button>

            <div className="flex items-center gap-0.5">
              {paginationRange.map((item, idx) => {
                if (item === "...") {
                  return (
                    <span key={`dots-${idx}`} className="px-1 text-slate-400 text-xs">
                      …
                    </span>
                  );
                }
                const pageNum = item as number;
                const isCurrent = pageNum === page;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "h-7 min-w-7 px-1.5 rounded text-xs font-medium transition-colors cursor-pointer",
                      isCurrent
                        ? "bg-slate-900 text-white font-semibold shadow-2xs"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    {pageNum + 1}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              title="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Right: Page Size Selector */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-7 rounded border border-slate-200 bg-slate-50/50 px-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
          >
            {PAGE_SIZES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

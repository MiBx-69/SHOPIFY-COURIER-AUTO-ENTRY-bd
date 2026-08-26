"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Search, 
  RefreshCw, 
  Truck, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  Bookmark,
  Trash2,
  Plus,
  Ban,
  Calendar,
  Layers,
  ArrowRight,
  ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { 
  FulfillmentBadge, 
  PaymentBadge, 
  DispatchBadge,
  StatusBadge
} from "@/components/ui/status-badge";

type LineItem = {
  id: string;
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  unit_price_minor: number;
  total_price_minor: number;
};

type Order = {
  id: string;
  name: string;
  order_number: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  shipping_address: Record<string, string> | null;
  total_minor: number;
  currency: string;
  fulfillment_status: string | null;
  financial_status: string | null;
  dispatch_status: string;
  shopify_created_at: string | null;
  shopify_updated_at: string;
  cancelled_at: string | null;
  is_skipped?: boolean;
  order_line_items: LineItem[];
  dispatches?: Array<{
    id: string;
    tracking_id?: string;
    courier_status?: string;
    safe_error_message?: string;
    courier_configs?: {
      id: string;
      couriers?: {
        provider?: string;
        display_name?: string;
      };
    };
  }>;
};

type SavedFilter = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
};

type TabCounts = {
  all: number;
  ready: number;
  unfulfilled: number;
  pending: number;
  attention: number;
  dispatched: number;
  skipped: number;
  failed: number;
  on_hold: number;
  partially_fulfilled: number;
  fulfilled: number;
  cancelled: number;
};

type BulkResultItem = {
  orderId: string;
  orderName: string;
  status: "dispatched" | "cancelled" | "failed" | "skipped" | "unsupported";
  trackingId?: string;
  courierName?: string;
  reason?: string;
  message?: string;
};

const TABS = [
  { id: "ready", label: "Ready to Dispatch" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "pending", label: "Pending Payment" },
  { id: "attention", label: "Attention Required" },
  { id: "dispatched", label: "Dispatched" },
  { id: "skipped", label: "Skipped" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All Orders" }
];

const DATE_SHORTCUTS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" }
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
  initialStatus = "ready",
  automaticCourier = true,
  availableCouriers = []
}: { 
  shopId: string; 
  initialStatus?: string;
  automaticCourier?: boolean;
  availableCouriers?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read initial states from URL if present
  const initialTab = searchParams.get("tab") || initialStatus || "ready";
  const initialDate = searchParams.get("date") || "";
  const initialSearch = searchParams.get("q") || "";

  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<TabCounts | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedOrderCache, setSelectedOrderCache] = useState<Map<string, Order>>(new Map());
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  
  // Advanced Filter State
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [filterDate, setFilterDate] = useState(initialDate);
  const [filterStartDate, setFilterStartDate] = useState(searchParams.get("startDate") || "");
  const [filterEndDate, setFilterEndDate] = useState(searchParams.get("endDate") || "");
  const [filterPayment, setFilterPayment] = useState(searchParams.get("payment") || "all");
  const [filterFulfillment, setFilterFulfillment] = useState(searchParams.get("fulfillment") || "all");
  const [filterCourier, setFilterCourier] = useState(searchParams.get("courier") || "all");
  const [filterMinAmount, setFilterMinAmount] = useState(searchParams.get("minAmount") || "");
  const [filterMaxAmount, setFilterMaxAmount] = useState(searchParams.get("maxAmount") || "");

  // Saved Filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [newFilterName, setNewFilterName] = useState("");
  const [savingFilter, setSavingFilter] = useState(false);

  // Pagination & Action states
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedCouriers, setSelectedCouriers] = useState<Record<string, string>>({});
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Modals & Sheets
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [bulkCourierId, setBulkCourierId] = useState<string>("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ 
    title: string;
    summary: { total: number; success: number; failed: number; skipped?: number; unsupported?: number };
    results: BulkResultItem[];
  } | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Keep selected order objects in cache for cross-page operations
  useEffect(() => {
    if (orders.length > 0) {
      setSelectedOrderCache((prev) => {
        const next = new Map(prev);
        orders.forEach((o) => {
          if (selectedSet.has(o.id)) {
            next.set(o.id, o);
          }
        });
        return next;
      });
    }
  }, [orders, selectedSet]);

  // Active filter count
  const activeFiltersCount = useMemo(() => {
    let cnt = 0;
    if (filterDate) cnt++;
    if (filterPayment !== "all") cnt++;
    if (filterFulfillment !== "all") cnt++;
    if (filterCourier !== "all") cnt++;
    if (filterMinAmount || filterMaxAmount) cnt++;
    return cnt;
  }, [filterDate, filterPayment, filterFulfillment, filterCourier, filterMinAmount, filterMaxAmount]);

  // URL Sync
  const updateUrl = useCallback((newTab: string, newDate: string, newSearch: string) => {
    const params = new URLSearchParams();
    if (newTab !== "ready") params.set("tab", newTab);
    if (newDate) params.set("date", newDate);
    if (newSearch) params.set("q", newSearch);
    if (filterPayment !== "all") params.set("payment", filterPayment);
    if (filterCourier !== "all") params.set("courier", filterCourier);
    if (filterMinAmount) params.set("minAmount", filterMinAmount);
    if (filterMaxAmount) params.set("maxAmount", filterMaxAmount);
    
    const queryStr = params.toString();
    const target = `/orders${queryStr ? `?${queryStr}` : ""}`;
    window.history.replaceState(null, "", target);
  }, [filterPayment, filterCourier, filterMinAmount, filterMaxAmount]);

  // Load Tab Counts
  async function loadCounts() {
    try {
      const res = await fetch(`/api/orders/counts?shopId=${shopId}`);
      if (res.ok) {
        const body = await res.json();
        setCounts(body.data);
      }
    } catch {
      // Non-blocking
    }
  }

  // Load Saved Filters
  async function loadSavedFilters() {
    try {
      const res = await fetch(`/api/saved-filters?shopId=${shopId}`);
      if (res.ok) {
        const body = await res.json();
        setSavedFilters(body.data || []);
      }
    } catch {
      // Non-blocking
    }
  }

  // Load Orders
  async function loadOrders() {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({
        shopId,
        tab,
        q: search,
        page: page.toString(),
        size: pageSize.toString()
      });
      if (filterDate) params.set("date", filterDate);
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);
      if (filterPayment !== "all") params.set("payment", filterPayment);
      if (filterFulfillment !== "all") params.set("fulfillment", filterFulfillment);
      if (filterCourier !== "all") params.set("courier", filterCourier);
      if (filterMinAmount) params.set("minAmount", filterMinAmount);
      if (filterMaxAmount) params.set("maxAmount", filterMaxAmount);

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

  useEffect(() => {
    loadCounts();
    loadSavedFilters();
  }, [shopId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadOrders();
      updateUrl(tab, filterDate, search);
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [shopId, tab, filterDate, filterPayment, filterFulfillment, filterCourier, filterMinAmount, filterMaxAmount, search, page, pageSize]);

  // Realtime updates
  useEffect(() => {
    const channel = createClient()
      .channel(`orders_rt:${shopId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `shop_id=eq.${shopId}` }, () => {
        loadOrders();
        loadCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches", filter: `shop_id=eq.${shopId}` }, () => {
        loadOrders();
        loadCounts();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_events", filter: `shop_id=eq.${shopId}` }, () => {
        loadOrders();
        loadCounts();
      })
      .subscribe();
    return () => {
      createClient().removeChannel(channel);
    };
  }, [shopId]);

  // ─── TAB & FILTER HANDLERS ───
  function handleTabChange(newTab: string) {
    setTab(newTab);
    setPage(0);
    setSelected([]);
  }

  function handleDateShortcut(datePreset: string) {
    const nextDate = filterDate === datePreset ? "" : datePreset;
    setFilterDate(nextDate);
    setPage(0);
  }

  function clearAllFilters() {
    setFilterDate("");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterPayment("all");
    setFilterFulfillment("all");
    setFilterCourier("all");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setPage(0);
  }

  async function handleSaveFilter() {
    if (!newFilterName.trim()) return;
    setSavingFilter(true);
    try {
      const config = {
        tab,
        date: filterDate,
        payment: filterPayment,
        fulfillment: filterFulfillment,
        courier: filterCourier,
        minAmount: filterMinAmount,
        maxAmount: filterMaxAmount
      };
      const res = await fetch("/api/saved-filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, name: newFilterName.trim(), filters: config })
      });
      if (res.ok) {
        setNewFilterName("");
        loadSavedFilters();
        setNotice({ text: "Filter preset saved successfully", type: "success" });
      }
    } catch {
      alert("Failed to save filter.");
    } finally {
      setSavingFilter(false);
    }
  }

  async function handleDeleteSavedFilter(id: string) {
    try {
      await fetch(`/api/saved-filters/${id}`, { method: "DELETE" });
      loadSavedFilters();
    } catch {
      // Non-blocking
    }
  }

  function applySavedFilter(f: SavedFilter) {
    const c = f.filters as Record<string, string>;
    if (c.tab) setTab(c.tab);
    if (c.date !== undefined) setFilterDate(c.date);
    if (c.payment) setFilterPayment(c.payment);
    if (c.fulfillment) setFilterFulfillment(c.fulfillment);
    if (c.courier) setFilterCourier(c.courier);
    if (c.minAmount !== undefined) setFilterMinAmount(c.minAmount);
    if (c.maxAmount !== undefined) setFilterMaxAmount(c.maxAmount);
    setShowFiltersDrawer(false);
    setPage(0);
  }

  // ─── SMART SELECTION ───
  const pageEligibleOrders = useMemo(() => {
    return orders.filter((o) => {
      if (tab === "skipped") return o.is_skipped;
      if (tab === "dispatched") return o.dispatch_status === "dispatched";
      // In ready/unfulfilled/pending/attention/all/failed: cannot select cancelled or already dispatched or skipped
      if (o.cancelled_at) return false;
      if (o.is_skipped) return false;
      if (o.dispatch_status === "dispatched") return false;
      return true;
    });
  }, [orders, tab]);

  const pageEligibleIds = useMemo(() => pageEligibleOrders.map((o) => o.id), [pageEligibleOrders]);
  const allEligibleOnPageSelected = pageEligibleIds.length > 0 && pageEligibleIds.every((id) => selectedSet.has(id));
  const someEligibleOnPageSelected = pageEligibleIds.some((id) => selectedSet.has(id)) && !allEligibleOnPageSelected;

  function toggleSelectAllPage() {
    if (allEligibleOnPageSelected) {
      setSelected((prev) => prev.filter((id) => !pageEligibleIds.includes(id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...pageEligibleIds])));
    }
  }

  function toggleSelectOrder(order: Order) {
    const isSel = selectedSet.has(order.id);
    if (isSel) {
      setSelected((prev) => prev.filter((id) => id !== order.id));
    } else {
      setSelected((prev) => [...prev, order.id]);
      setSelectedOrderCache((prev) => new Map(prev).set(order.id, order));
    }
  }

  // ─── ACTIONS ON SINGLE ORDERS ───
  async function handleSingleDispatch(orderId: string) {
    if (!window.confirm("Confirm dispatch? A courier shipment will be created.")) return;
    setActionLoadingId(orderId);
    setNotice({ text: "Dispatching order…", type: "info" });
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderId, 
          courierConfigId: selectedCouriers[orderId], 
          idempotencyKey: crypto.randomUUID() 
        })
      });
      const body = await response.json();
      if (response.ok) {
        setNotice({ 
          text: `Order dispatched! Tracking: ${body.data?.tracking_id || "Generated"}`, 
          type: "success" 
        });
        loadOrders();
        loadCounts();
      } else {
        setNotice({ text: body.error || "Dispatch failed", type: "error" });
      }
    } catch {
      setNotice({ text: "Network error during dispatch.", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSingleSkip(orderId: string) {
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/orders/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [orderId], reason: "Removed from dispatch" })
      });
      if (res.ok) {
        setNotice({ text: "Order removed from dispatch queue", type: "success" });
        loadOrders();
        loadCounts();
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSingleRestore(orderId: string) {
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/orders/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [orderId] })
      });
      if (res.ok) {
        setNotice({ text: "Order restored to dispatch queue", type: "success" });
        loadOrders();
        loadCounts();
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSingleCancelDispatch(orderId: string) {
    if (!window.confirm("Cancel courier dispatch for this shipment? The Shopify order will NOT be cancelled.")) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/dispatch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [orderId], reason: "Cancelled by user" })
      });
      const body = await res.json();
      if (res.ok) {
        const item = body.data?.[0];
        if (item?.status === "unsupported") {
          alert(`Notice: ${item.reason}`);
        } else if (item?.status === "cancelled") {
          setNotice({ text: "Courier dispatch cancelled successfully", type: "success" });
          loadOrders();
          loadCounts();
        } else {
          setNotice({ text: item?.reason || "Cancellation failed", type: "error" });
        }
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  // ─── BULK ACTION EXECUTIONS ───
  async function executeBulkDispatch(orderIdsToDispatch: string[]) {
    if (!orderIdsToDispatch.length) return;
    setBatchProcessing(true);
    try {
      const response = await fetch("/api/dispatch/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderIds: orderIdsToDispatch,
          courierConfigId: bulkCourierId || undefined
        })
      });
      const resJson = await response.json();
      if (!response.ok) throw new Error(resJson.error || "Bulk dispatch failed");

      const dispatched = resJson.data?.filter((r: BulkResultItem) => r.status === "dispatched").length || 0;
      const failed = resJson.data?.filter((r: BulkResultItem) => r.status === "failed").length || 0;
      const skipped = resJson.data?.filter((r: BulkResultItem) => r.status === "skipped").length || 0;

      setBulkResults({
        title: "Bulk Dispatch Results",
        summary: { total: resJson.data?.length || 0, success: dispatched, failed, skipped },
        results: resJson.data || []
      });

      setSelected([]);
      setShowDispatchModal(false);
      setShowResultModal(true);
      loadOrders();
      loadCounts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bulk dispatch encountered an error.");
    } finally {
      setBatchProcessing(false);
    }
  }

  async function executeBulkSkip() {
    if (!selected.length) return;
    setBatchProcessing(true);
    try {
      const res = await fetch("/api/orders/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selected, reason: skipReason })
      });
      if (res.ok) {
        setNotice({ text: `${selected.length} orders removed from dispatch`, type: "success" });
        setSelected([]);
        setShowSkipModal(false);
        setSkipReason("");
        loadOrders();
        loadCounts();
      }
    } finally {
      setBatchProcessing(false);
    }
  }

  async function executeBulkRestore() {
    if (!selected.length) return;
    setBatchProcessing(true);
    try {
      const res = await fetch("/api/orders/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selected })
      });
      if (res.ok) {
        setNotice({ text: `${selected.length} orders restored to dispatch queue`, type: "success" });
        setSelected([]);
        loadOrders();
        loadCounts();
      }
    } finally {
      setBatchProcessing(false);
    }
  }

  async function executeBulkCancelDispatch() {
    if (!selected.length) return;
    setBatchProcessing(true);
    try {
      const res = await fetch("/api/dispatch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selected, reason: cancelReason })
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error || "Cancellation failed");

      setBulkResults({
        title: "Bulk Dispatch Cancellation Summary",
        summary: {
          total: resJson.summary?.total || 0,
          success: resJson.summary?.cancelled || 0,
          failed: resJson.summary?.failed || 0,
          unsupported: resJson.summary?.unsupported || 0
        },
        results: resJson.data || []
      });

      setSelected([]);
      setShowCancelModal(false);
      setCancelReason("");
      setShowResultModal(true);
      loadOrders();
      loadCounts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error cancelling dispatches");
    } finally {
      setBatchProcessing(false);
    }
  }

  // Pre-dispatch Validation
  const selectedOrdersList = useMemo(() => {
    return selected.map((id) => selectedOrderCache.get(id) || orders.find((o) => o.id === id)).filter(Boolean) as Order[];
  }, [selected, selectedOrderCache, orders]);

  const dispatchValidation = useMemo(() => {
    const ready: Order[] = [];
    const needAttention: { order: Order; issue: string }[] = [];
    let estimatedCodMinor = 0;

    selectedOrdersList.forEach((order) => {
      if (order.cancelled_at) {
        needAttention.push({ order, issue: "Order is cancelled" });
      } else if (order.dispatch_status === "dispatched") {
        needAttention.push({ order, issue: "Already dispatched" });
      } else if (!order.customer_phone) {
        needAttention.push({ order, issue: "Missing phone number" });
      } else if (!order.shipping_address || Object.keys(order.shipping_address).length === 0) {
        needAttention.push({ order, issue: "Missing address" });
      } else {
        ready.push(order);
        estimatedCodMinor += order.total_minor || 0;
      }
    });

    return { ready, needAttention, estimatedCodMinor };
  }, [selectedOrdersList]);

  // Total pages
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startItem = totalCount === 0 ? 0 : page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="space-y-2">
      {/* ─── 1. TOP CONTROLS & SEARCH BAR ─── */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by order #, customer, phone, email, SKU, tracking..."
              className="h-8.5 w-full rounded-md border border-slate-200 bg-slate-50/50 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
            />
            {search && (
              <button 
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }} 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Quick Date Shortcuts (Desktop & Mobile) */}
          <div className="hidden sm:flex items-center gap-1">
            {DATE_SHORTCUTS.map((ds) => {
              const active = filterDate === ds.id;
              return (
                <button
                  key={ds.id}
                  onClick={() => handleDateShortcut(ds.id)}
                  className={cn(
                    "h-8.5 px-2.5 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                    active
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  {ds.label}
                </button>
              );
            })}
          </div>

          {/* Filters Toggle Button */}
          <button
            onClick={() => setShowFiltersDrawer(true)}
            className={cn(
              "flex h-8.5 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors cursor-pointer shrink-0",
              activeFiltersCount > 0
                ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            )}
          >
            <SlidersHorizontal size={13} />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-white text-slate-900 text-[10px] font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Refresh button */}
          <button
            onClick={() => {
              loadOrders();
              loadCounts();
            }}
            disabled={loading}
            title="Refresh orders"
            className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-slate-900")} />
          </button>
        </div>

        {/* ─── 2. PRIMARY TABS BAR ─── */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1 shrink-0">
            {TABS.map((t) => {
              const active = tab === t.id;
              const countVal = counts ? (counts[t.id as keyof TabCounts] ?? null) : null;

              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id)}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer",
                    active
                      ? "bg-slate-900 text-white font-semibold shadow-2xs"
                      : "bg-slate-100/70 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900"
                  )}
                >
                  <span>{t.label}</span>
                  {countVal !== null && (
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.2 rounded-full",
                      active ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"
                    )}>
                      {countVal.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center text-[11px] text-slate-500 font-medium shrink-0 pl-2">
            <span>Total Orders: <strong className="text-slate-900 font-semibold">{totalCount.toLocaleString()}</strong></span>
          </div>
        </div>
      </div>

      {/* ─── 3. STICKY BULK ACTION BAR ─── */}
      {selected.length > 0 && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs text-white shadow-md border border-slate-800 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
              {selected.length}
            </span>
            <span className="font-semibold">{selected.length} order{selected.length > 1 ? "s" : ""} selected</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setSelected([])}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 transition-colors cursor-pointer"
            >
              Clear
            </button>

            {/* In Skipped tab: Bulk Restore */}
            {tab === "skipped" ? (
              <Button
                onClick={executeBulkRestore}
                disabled={batchProcessing}
                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>Restore Selected ({selected.length})</span>
              </Button>
            ) : tab === "dispatched" ? (
              /* In Dispatched tab: Bulk Cancel Dispatch */
              <Button
                onClick={() => setShowCancelModal(true)}
                className="h-7 px-3 text-xs bg-red-600 hover:bg-red-500 text-white font-semibold rounded transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Ban size={13} />
                <span>Cancel Dispatch Selected ({selected.length})</span>
              </Button>
            ) : (
              /* In active dispatch queues: Bulk Dispatch & Remove from Dispatch */
              <>
                <Button 
                  variant="secondary"
                  onClick={() => setShowSkipModal(true)}
                  className="h-7 px-2.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-medium rounded transition-all cursor-pointer"
                >
                  Remove from Dispatch
                </Button>

                <Button 
                  onClick={() => {
                    setBulkCourierId("");
                    setShowDispatchModal(true);
                  }}
                  className="h-7 px-3 text-xs bg-white text-slate-900 hover:bg-slate-100 font-semibold shadow-2xs rounded transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Truck size={13} />
                  <span>Dispatch Selected ({dispatchValidation.ready.length})</span>
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── 4. STATUS NOTICES ─── */}
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
            {notice.type === "info" && <RotateCcw size={14} className="text-sky-600 shrink-0" />}
            <span>{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 ml-2 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle size={15} className="shrink-0" />
          <span className="font-semibold">Error:</span>
          <span>{error}</span>
        </div>
      )}

      {/* ─── 5. DESKTOP ORDERS TABLE ─── */}
      <div className="hidden md:block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="w-10 px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allEligibleOnPageSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someEligibleOnPageSelected;
                  }}
                  onChange={toggleSelectAllPage}
                  title="Select all eligible on page"
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
                const isCancelled = Boolean(order.cancelled_at);
                const isSkipped = order.is_skipped;
                const isFailed = order.dispatch_status === "failed";

                const fulfillmentStatus = isCancelled 
                  ? "CANCELLED" 
                  : (order.fulfillment_status || "UNFULFILLED");

                return (
                  <tr 
                    key={order.id} 
                    className={cn(
                      "hover:bg-slate-50/80 transition-colors h-[48px]",
                      isSelected && "bg-slate-50/95 ring-1 ring-inset ring-slate-200"
                    )}
                  >
                    {/* Select Checkbox */}
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOrder(order)}
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
                      {order.customer_phone ? (
                        <span className="text-[11px] text-slate-400 font-mono block truncate">{order.customer_phone}</span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-medium block">No Phone</span>
                      )}
                    </td>

                    {/* Items */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-600">
                      <span 
                        className="cursor-default border-b border-dotted border-slate-300"
                        title={order.order_line_items?.map((i) => `${i.quantity}x ${i.title}${i.sku ? ` (${i.sku})` : ""}`).join("\n")}
                      >
                        {totalItemCount} {totalItemCount === 1 ? "item" : "items"}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-2.5 py-1.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {money(order.total_minor, order.currency)}
                    </td>

                    {/* Payment Status Badge */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <PaymentBadge status={order.financial_status} />
                    </td>

                    {/* Fulfillment Status Badge */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <FulfillmentBadge status={fulfillmentStatus} />
                    </td>

                    {/* Courier */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-600 text-[11px]">
                      {courierName ? (
                        <span className="font-medium text-slate-800">{courierName}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Dispatch Status Badge */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      {isSkipped ? (
                        <StatusBadge label="Skipped" color="slate" dot />
                      ) : (
                        <DispatchBadge 
                          status={order.dispatch_status} 
                          tracking={tracking} 
                          copied={copiedTracking === tracking}
                          onCopy={(t) => {
                            navigator.clipboard.writeText(t);
                            setCopiedTracking(t);
                            setTimeout(() => setCopiedTracking(null), 2000);
                          }}
                        />
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-2.5 py-1.5 whitespace-nowrap text-[11px] text-slate-500" title={fmtFullDate(order.shopify_created_at || order.shopify_updated_at)}>
                      {fmtShortDate(order.shopify_created_at || order.shopify_updated_at)}
                    </td>

                    {/* Action Column */}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {isCancelled ? (
                        <span className="text-[11px] text-slate-400 font-medium">Void</span>
                      ) : isSkipped ? (
                        <button
                          onClick={() => handleSingleRestore(order.id)}
                          disabled={actionLoadingId === order.id}
                          className="h-6.5 px-2.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-medium transition-all inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        >
                          {actionLoadingId === order.id ? <RefreshCw size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                          Restore
                        </button>
                      ) : isDispatched ? (
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSingleCancelDispatch(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="h-6.5 px-2 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-medium transition-colors cursor-pointer"
                            title="Cancel courier shipment"
                          >
                            Cancel Dispatch
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSingleSkip(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="h-6.5 px-1.5 text-slate-400 hover:text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                            title="Remove from dispatch queue"
                          >
                            Skip
                          </button>

                          <button
                            onClick={() => handleSingleDispatch(order.id)}
                            disabled={actionLoadingId === order.id}
                            className={cn(
                              "h-6.5 px-2.5 rounded text-white text-[11px] font-medium transition-all inline-flex items-center gap-1 disabled:opacity-50 shadow-2xs cursor-pointer",
                              isFailed ? "bg-amber-700 hover:bg-amber-600" : "bg-slate-900 hover:bg-slate-800"
                            )}
                          >
                            {actionLoadingId === order.id ? (
                              <RefreshCw size={11} className="animate-spin" />
                            ) : (
                              <Truck size={11} />
                            )}
                            {isFailed ? "Retry" : "Dispatch"}
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

      {/* ─── 6. MOBILE COMPACT ORDER ROWS ─── */}
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
            const totalItemCount = order.order_line_items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
            const isDispatched = order.dispatch_status === "dispatched";
            const isCancelled = Boolean(order.cancelled_at);
            const isSkipped = order.is_skipped;

            const fulfillmentStatus = isCancelled 
              ? "CANCELLED" 
              : (order.fulfillment_status || "UNFULFILLED");

            return (
              <div 
                key={order.id}
                className={cn(
                  "p-2.5 flex items-start gap-2.5 transition-colors",
                  isSelected && "bg-slate-50/95"
                )}
              >
                {/* Touch Checkbox */}
                <label className="flex items-center p-1 -m-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectOrder(order)}
                    className="size-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 shrink-0"
                  />
                </label>

                {/* Content */}
                <div className="flex-1 min-w-0">
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

                  <div className="text-[11px] text-slate-600 truncate mt-0.5">
                    <span>{order.customer_name || "No name"}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span>{totalItemCount} item{totalItemCount !== 1 ? "s" : ""}</span>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 mt-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <FulfillmentBadge size="sm" short status={fulfillmentStatus} />
                      <PaymentBadge size="sm" short status={order.financial_status} />
                      {isSkipped ? (
                        <StatusBadge size="sm" label="Skipped" color="slate" dot />
                      ) : (
                        <DispatchBadge size="sm" status={order.dispatch_status} tracking={tracking} />
                      )}
                      <span className="text-slate-400">{fmtShortDate(order.shopify_created_at || order.shopify_updated_at)}</span>
                    </div>

                    {!isCancelled && (
                      <div>
                        {isSkipped ? (
                          <button
                            onClick={() => handleSingleRestore(order.id)}
                            className="h-6 px-2 rounded bg-emerald-700 text-white text-[10px] font-medium"
                          >
                            Restore
                          </button>
                        ) : isDispatched ? (
                          <button
                            onClick={() => handleSingleCancelDispatch(order.id)}
                            className="h-6 px-1.5 rounded border border-red-200 bg-red-50 text-red-700 text-[10px]"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSingleDispatch(order.id)}
                            disabled={actionLoadingId === order.id}
                            className="h-6 px-2 rounded bg-slate-900 text-white text-[10px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            {actionLoadingId === order.id ? <RefreshCw size={10} className="animate-spin" /> : <Truck size={10} />}
                            Dispatch
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── 7. BOTTOM PAGINATION BAR ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
        <div className="text-slate-500 text-[11px]">
          Showing <span className="font-semibold text-slate-800">{startItem}–{endItem}</span> of <span className="font-semibold text-slate-800">{totalCount.toLocaleString()}</span> orders
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>

            <span className="text-xs text-slate-700 font-medium px-2">
              Page {page + 1} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span>Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="h-7 rounded border border-slate-200 bg-slate-50/50 px-2 text-xs font-medium text-slate-800 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── 8. ADVANCED FILTERS DRAWER / MODAL ─── */}
      {showFiltersDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-xs animate-in fade-in">
          <div className="h-full w-full max-w-md bg-white p-5 shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-slate-900" />
                  <h3 className="text-sm font-bold text-slate-900">Advanced Filters</h3>
                </div>
                <button 
                  onClick={() => setShowFiltersDrawer(false)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Saved Filters Section */}
              {savedFilters.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 border border-slate-200">
                  <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                    <Bookmark size={12} />
                    Saved Filters
                  </label>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {savedFilters.map((sf) => (
                      <div key={sf.id} className="inline-flex items-center rounded-full bg-white border border-slate-200 pl-2.5 pr-1 py-0.5 text-xs text-slate-800 shadow-2xs">
                        <button onClick={() => applySavedFilter(sf)} className="font-medium hover:underline cursor-pointer">
                          {sf.name}
                        </button>
                        <button onClick={() => handleDeleteSavedFilter(sf.id)} className="text-slate-400 hover:text-red-600 ml-1 p-0.5">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Date Range</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {["today", "yesterday", "7d", "30d", "month", "last_month"].map((d) => (
                    <button
                      key={d}
                      onClick={() => setFilterDate(filterDate === d ? "" : d)}
                      className={cn(
                        "h-7 rounded border text-[11px] font-medium transition-colors cursor-pointer",
                        filterDate === d
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {d === "7d" ? "7 Days" : d === "30d" ? "30 Days" : d === "month" ? "This Month" : d === "last_month" ? "Last Month" : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Pickers */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => {
                      setFilterStartDate(e.target.value);
                      setFilterDate("custom");
                    }}
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs bg-slate-50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => {
                      setFilterEndDate(e.target.value);
                      setFilterDate("custom");
                    }}
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs bg-slate-50"
                  />
                </div>
              </div>

              {/* Payment Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Payment Status</label>
                <select
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                  className="h-8 w-full rounded border border-slate-200 px-2 text-xs bg-slate-50"
                >
                  <option value="all">All Payment Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending / COD</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="refunded">Refunded</option>
                  <option value="voided">Voided</option>
                </select>
              </div>

              {/* Courier Provider */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Courier Provider</label>
                <select
                  value={filterCourier}
                  onChange={(e) => setFilterCourier(e.target.value)}
                  className="h-8 w-full rounded border border-slate-200 px-2 text-xs bg-slate-50"
                >
                  <option value="all">All Couriers</option>
                  <option value="redx">REDX</option>
                  <option value="pathao">Pathao</option>
                  <option value="steadfast">Steadfast</option>
                  <option value="none">No Courier Dispatched</option>
                </select>
              </div>

              {/* Amount Range */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Order Amount (৳ BDT)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={filterMinAmount}
                    onChange={(e) => setFilterMinAmount(e.target.value)}
                    placeholder="Min ৳"
                    className="h-8 rounded border border-slate-200 px-2 text-xs bg-slate-50"
                  />
                  <input
                    type="number"
                    value={filterMaxAmount}
                    onChange={(e) => setFilterMaxAmount(e.target.value)}
                    placeholder="Max ৳"
                    className="h-8 rounded border border-slate-200 px-2 text-xs bg-slate-50"
                  />
                </div>
              </div>

              {/* Save Filter Preset Box */}
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                <label className="text-xs font-semibold text-slate-800">Save Filter as Preset</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                    placeholder="e.g. Today's COD high value"
                    className="h-8 flex-1 rounded border border-slate-200 px-2 text-xs bg-slate-50"
                  />
                  <button
                    onClick={handleSaveFilter}
                    disabled={savingFilter || !newFilterName.trim()}
                    className="h-8 px-3 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium disabled:opacity-50 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={clearAllFilters}
                className="h-8 text-xs text-slate-500 hover:text-slate-800"
              >
                Clear All
              </Button>
              <Button
                onClick={() => setShowFiltersDrawer(false)}
                className="h-8 px-4 text-xs bg-slate-900 text-white hover:bg-slate-800 font-medium"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 9. BULK DISPATCH CONFIRMATION MODAL ─── */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-white">
                  <Truck size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Bulk Dispatch</h3>
                  <p className="text-xs text-slate-500">{selected.length} orders selected for review</p>
                </div>
              </div>
              <button onClick={() => setShowDispatchModal(false)} disabled={batchProcessing} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-100">
                  <span className="text-[11px] font-semibold text-emerald-800 block">Ready to Dispatch</span>
                  <strong className="text-base font-bold text-emerald-950">{dispatchValidation.ready.length}</strong>
                </div>
                <div className="rounded-lg bg-amber-50 p-2.5 border border-amber-100">
                  <span className="text-[11px] font-semibold text-amber-800 block">Needs Attention</span>
                  <strong className="text-base font-bold text-amber-950">{dispatchValidation.needAttention.length}</strong>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 border border-slate-200/80">
                <span className="text-slate-600 font-medium">Estimated Total COD:</span>
                <span className="text-sm font-bold text-slate-900">{money(dispatchValidation.estimatedCodMinor, "BDT")}</span>
              </div>

              {/* Courier Selection */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <label className="font-semibold text-slate-800 block">Courier Assignment</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bulkCourier"
                      value=""
                      checked={bulkCourierId === ""}
                      onChange={() => setBulkCourierId("")}
                      className="size-3.5 text-slate-900"
                    />
                    <span className="font-medium text-slate-800">Automatic Priority Fallback</span>
                  </label>
                  {availableCouriers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkCourier"
                        value={c.id}
                        checked={bulkCourierId === c.id}
                        onChange={() => setBulkCourierId(c.id)}
                        className="size-3.5 text-slate-900"
                      />
                      <span className="font-medium text-slate-800">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" disabled={batchProcessing} onClick={() => setShowDispatchModal(false)} className="h-8 px-3 text-xs">
                Cancel
              </Button>
              <Button
                disabled={batchProcessing || dispatchValidation.ready.length === 0}
                onClick={() => executeBulkDispatch(dispatchValidation.ready.map((o) => o.id))}
                className="h-8 px-4 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-1.5 shadow-xs"
              >
                {batchProcessing ? <RefreshCw size={12} className="animate-spin" /> : <Truck size={12} />}
                <span>Dispatch {dispatchValidation.ready.length} Ready Orders</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 10. BULK REMOVE FROM DISPATCH (SKIP) MODAL ─── */}
      {showSkipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Remove from Dispatch Queue</h3>
              <button onClick={() => setShowSkipModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                Remove <strong className="text-slate-900">{selected.length}</strong> selected orders from active dispatch?
              </p>
              <p className="text-[11px] text-slate-400">
                The orders will remain in Shopify and can be restored at any time from the <strong>Skipped</strong> tab.
              </p>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  placeholder="e.g. Awaiting customer confirmation"
                  className="h-8 w-full rounded border border-slate-200 px-2 text-xs bg-slate-50"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" onClick={() => setShowSkipModal(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                onClick={executeBulkSkip}
                disabled={batchProcessing}
                className="h-8 px-4 text-xs bg-slate-900 text-white hover:bg-slate-800"
              >
                {batchProcessing ? "Removing…" : `Remove ${selected.length} Orders`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 11. BULK CANCEL DISPATCH MODAL ─── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Cancel Courier Dispatches</h3>
              <button onClick={() => setShowCancelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                Cancel courier dispatch for <strong className="text-slate-900">{selected.length}</strong> selected shipments?
              </p>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                This will call the courier API to cancel the shipments if supported. The Shopify orders will <strong>NOT</strong> be cancelled.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" onClick={() => setShowCancelModal(false)} className="h-8 text-xs">
                Cancel
              </Button>
              <Button
                onClick={executeBulkCancelDispatch}
                disabled={batchProcessing}
                className="h-8 px-4 text-xs bg-red-600 hover:bg-red-500 text-white"
              >
                {batchProcessing ? "Processing…" : `Confirm Cancel (${selected.length})`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 12. BATCH RESULT SUMMARY MODAL ─── */}
      {showResultModal && bulkResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">{bulkResults.title}</h3>
              <button onClick={() => setShowResultModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 border border-emerald-200 font-semibold">
                <CheckCircle2 size={12} className="text-emerald-600" />
                {bulkResults.summary.success} Successful
              </span>
              {bulkResults.summary.failed > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-red-800 border border-red-200 font-semibold">
                  <AlertCircle size={12} className="text-red-600" />
                  {bulkResults.summary.failed} Failed
                </span>
              )}
              {Boolean(bulkResults.summary.unsupported) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 border border-amber-200 font-semibold">
                  <AlertTriangle size={12} className="text-amber-600" />
                  {bulkResults.summary.unsupported} Unsupported
                </span>
              )}
              {Boolean(bulkResults.summary.skipped) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200 font-medium">
                  {bulkResults.summary.skipped} Skipped
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-100 rounded-lg p-2.5 bg-slate-50 text-xs divide-y divide-slate-200/60">
              {bulkResults.results.map((res, i) => (
                <div key={`${res.orderId}-${i}`} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-slate-900">{res.orderName}</span>
                    {res.reason && <span className="text-slate-500 text-[11px] truncate">· {res.reason}</span>}
                    {res.trackingId && <span className="text-emerald-700 font-mono text-[11px]">· {res.trackingId}</span>}
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0",
                    (res.status === "dispatched" || res.status === "cancelled") && "bg-emerald-100 text-emerald-800",
                    res.status === "failed" && "bg-red-100 text-red-800",
                    res.status === "unsupported" && "bg-amber-100 text-amber-800",
                    res.status === "skipped" && "bg-slate-200 text-slate-700"
                  )}>
                    {res.status}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <Button onClick={() => setShowResultModal(false)} className="h-8 px-4 text-xs bg-slate-900 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

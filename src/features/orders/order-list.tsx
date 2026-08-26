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
  ExternalLink,
  MapPin,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { money, cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { 
  FulfillmentBadge, 
  PaymentBadge, 
  DispatchBadge
} from "@/components/ui/status-badge";
import type { PickupLocation } from "@/types/domain";

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

const ORDERS_TABS = [
  { id: "ready", label: "Ready to Dispatch" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "pending", label: "Pending Payment" },
  { id: "attention", label: "Attention Required" },
  { id: "skipped", label: "Skipped" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All Orders" }
];

const DISPATCHED_DATE_SHORTCUTS = [
  { id: "", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 Days" },
  { id: "30d", label: "30 Days" }
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
  mode = "orders",
  initialStatus = "ready",
  automaticCourier = true,
  availableCouriers = []
}: { 
  shopId: string; 
  mode?: "orders" | "dispatched";
  initialStatus?: string;
  automaticCourier?: boolean;
  availableCouriers?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const isDispatchedMode = mode === "dispatched";

  // Read initial states from URL if present
  const initialTab = isDispatchedMode ? "dispatched" : (searchParams.get("tab") || initialStatus || "ready");
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
  const [copiedTracking, setCopiedTracking] = useState<string | null>(null);

  // Pickup Locations Cache State
  const [courierPickupMap, setCourierPickupMap] = useState<Record<string, { courierName: string; provider: string; locations: PickupLocation[]; defaultLocationId?: string }>>({});

  // Modals & Sheets
  const [singleDispatchOrder, setSingleDispatchOrder] = useState<Order | null>(null);
  const [singleDispatchCourierId, setSingleDispatchCourierId] = useState<string>("");
  const [singleDispatchPickupLocationId, setSingleDispatchPickupLocationId] = useState<string>("");

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [bulkCourierId, setBulkCourierId] = useState<string>("");
  const [bulkPickupLocationId, setBulkPickupLocationId] = useState<string>("");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ 
    title: string;
    summary: { total: number; success: number; failed: number; skipped?: number; unsupported?: number };
    results: BulkResultItem[];
  } | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

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
    if (!isDispatchedMode && newTab !== "ready") params.set("tab", newTab);
    if (newDate) params.set("date", newDate);
    if (newSearch) params.set("q", newSearch);
    if (filterPayment !== "all") params.set("payment", filterPayment);
    if (filterCourier !== "all") params.set("courier", filterCourier);
    if (filterMinAmount) params.set("minAmount", filterMinAmount);
    if (filterMaxAmount) params.set("maxAmount", filterMaxAmount);
    
    const queryStr = params.toString();
    const basePath = isDispatchedMode ? "/dispatched" : "/orders";
    const target = `${basePath}${queryStr ? `?${queryStr}` : ""}`;
    window.history.replaceState(null, "", target);
  }, [isDispatchedMode, filterPayment, filterCourier, filterMinAmount, filterMaxAmount]);

  // Load Tab Counts
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/counts?shopId=${shopId}`);
      if (res.ok) {
        const body = await res.json();
        setCounts(body.data);
      }
    } catch {
      // Non-blocking
    }
  }, [shopId]);

  // Load Saved Filters
  const loadSavedFilters = useCallback(async () => {
    try {
      const res = await fetch(`/api/saved-filters?shopId=${shopId}`);
      if (res.ok) {
        const body = await res.json();
        setSavedFilters(body.data || []);
      }
    } catch {
      // Non-blocking
    }
  }, [shopId]);

  // Load Courier Pickup Locations for this shop
  const loadCourierPickupLocations = useCallback(async () => {
    try {
      const res = await fetch(`/api/shops/${shopId}/pickup-locations`);
      if (res.ok) {
        const body = await res.json();
        setCourierPickupMap(body.data || {});
      }
    } catch {
      // Non-blocking
    }
  }, [shopId]);

  // Load Orders
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const activeTab = isDispatchedMode ? "dispatched" : tab;
      const params = new URLSearchParams({
        shopId,
        tab: activeTab,
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
      const loaded: Order[] = body.data || [];
      setOrders(loaded);
      setTotalCount(body.count || 0);

      setSelectedOrderCache((prev) => {
        const next = new Map(prev);
        loaded.forEach((o) => {
          if (selectedSet.has(o.id)) {
            next.set(o.id, o);
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [shopId, isDispatchedMode, tab, search, page, pageSize, filterDate, filterStartDate, filterEndDate, filterPayment, filterFulfillment, filterCourier, filterMinAmount, filterMaxAmount, selectedSet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadOrders();
      loadCounts();
      loadSavedFilters();
      loadCourierPickupLocations();
      updateUrl(tab, filterDate, search);
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadOrders, loadCounts, loadSavedFilters, loadCourierPickupLocations, updateUrl, tab, filterDate, search]);

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
      .subscribe();

    return () => {
      createClient().removeChannel(channel);
    };
  }, [shopId, loadOrders, loadCounts]);

  // Handle Tab Switch
  function handleTabChange(newTab: string) {
    setTab(newTab);
    setPage(0);
    setSelected([]);
  }

  // Handle Date Filter Quick Selection
  function handleDateShortcut(val: string) {
    const nextVal = filterDate === val ? "" : val;
    setFilterDate(nextVal);
    setFilterStartDate("");
    setFilterEndDate("");
    setPage(0);
  }

  // Clear all filters
  function clearAllFilters() {
    setFilterDate("");
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterPayment("all");
    setFilterFulfillment("all");
    setFilterCourier("all");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setSearch("");
    setPage(0);
    setShowFiltersDrawer(false);
  }

  // Multi-Selection Logic
  const eligibleOrdersOnPage = useMemo(() => {
    if (tab === "cancelled") return [];
    return orders;
  }, [orders, tab]);

  const allEligibleOnPageSelected = useMemo(() => {
    if (eligibleOrdersOnPage.length === 0) return false;
    return eligibleOrdersOnPage.every((o) => selectedSet.has(o.id));
  }, [eligibleOrdersOnPage, selectedSet]);

  const someEligibleOnPageSelected = useMemo(() => {
    return eligibleOrdersOnPage.some((o) => selectedSet.has(o.id)) && !allEligibleOnPageSelected;
  }, [eligibleOrdersOnPage, selectedSet, allEligibleOnPageSelected]);

  function toggleSelectAllPage() {
    if (allEligibleOnPageSelected) {
      const onPageIds = new Set(eligibleOrdersOnPage.map((o) => o.id));
      setSelected((prev) => prev.filter((id) => !onPageIds.has(id)));
    } else {
      const onPageIds = eligibleOrdersOnPage.map((o) => o.id);
      setSelected((prev) => Array.from(new Set([...prev, ...onPageIds])));
      setSelectedOrderCache((prev) => {
        const next = new Map(prev);
        eligibleOrdersOnPage.forEach((o) => next.set(o.id, o));
        return next;
      });
    }
  }

  function toggleSelectOrder(order: Order) {
    setSelected((prev) => {
      if (prev.includes(order.id)) {
        return prev.filter((id) => id !== order.id);
      } else {
        setSelectedOrderCache((c) => new Map(c).set(order.id, order));
        return [...prev, order.id];
      }
    });
  }

  const selectedOrdersList = useMemo(() => {
    return selected.map((id) => selectedOrderCache.get(id)).filter(Boolean) as Order[];
  }, [selected, selectedOrderCache]);

  const dispatchValidation = useMemo(() => {
    const ready: Order[] = [];
    const needAttention: Array<{ order: Order; issues: string[] }> = [];
    let estimatedCodMinor = 0;

    selectedOrdersList.forEach((order) => {
      const issues: string[] = [];
      if (order.cancelled_at) issues.push("Order is cancelled in Shopify");
      if (order.dispatch_status === "dispatched") issues.push("Already dispatched");
      if (!order.customer_phone) issues.push("Missing customer phone number");
      if (!order.shipping_address) issues.push("Missing delivery address");

      if (issues.length === 0) {
        ready.push(order);
        if (order.financial_status?.toLowerCase() !== "paid") {
          estimatedCodMinor += Number(order.total_minor || 0);
        }
      } else {
        needAttention.push({ order, issues });
      }
    });

    return { ready, needAttention, estimatedCodMinor };
  }, [selectedOrdersList]);

  // Total pages
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const startItem = totalCount === 0 ? 0 : page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  // Single Order Dispatch Flow
  function openSingleDispatchModal(order: Order) {
    setSingleDispatchOrder(order);
    const firstCourier = availableCouriers[0]?.id || "";
    setSingleDispatchCourierId(firstCourier);

    const locationsData = courierPickupMap[firstCourier];
    const defaultLoc = locationsData?.locations?.find((l) => l.id === locationsData.defaultLocationId || l.isDefault) || locationsData?.locations?.[0];
    setSingleDispatchPickupLocationId(defaultLoc?.id || "");

    setShowDispatchModal(true);
  }

  async function executeSingleDispatch() {
    if (!singleDispatchOrder) return;
    setActionLoadingId(singleDispatchOrder.id);
    setShowDispatchModal(false);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: singleDispatchOrder.id,
          idempotencyKey: crypto.randomUUID(),
          courierConfigId: singleDispatchCourierId || undefined,
          pickupLocationId: singleDispatchPickupLocationId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to dispatch order");
      }
      const courierTag = data.courierName ? ` via ${data.courierName}` : "";
      const trackingTag = data.trackingId ? ` (Tracking: ${data.trackingId})` : "";
      setNotice({ 
        text: `Order ${singleDispatchOrder.name} dispatched successfully${courierTag}!${trackingTag}`, 
        type: "success" 
      });
      loadOrders();
      loadCounts();
    } catch (err: unknown) {
      setNotice({ 
        text: `Dispatch failed for ${singleDispatchOrder.name}: ${err instanceof Error ? err.message : "Courier rejected request"}`, 
        type: "error" 
      });
      loadOrders();
      loadCounts();
    } finally {
      setActionLoadingId(null);
      setSingleDispatchOrder(null);
    }
  }

  // Bulk Dispatch Flow
  function openBulkDispatchModal() {
    if (dispatchValidation.ready.length === 0) {
      setNotice({ text: "None of the selected orders are eligible for dispatch.", type: "error" });
      return;
    }
    const firstCourier = availableCouriers[0]?.id || "";
    setBulkCourierId(firstCourier);

    const locationsData = courierPickupMap[firstCourier];
    const defaultLoc = locationsData?.locations?.find((l) => l.id === locationsData.defaultLocationId || l.isDefault) || locationsData?.locations?.[0];
    setBulkPickupLocationId(defaultLoc?.id || "");

    setShowDispatchModal(true);
  }

  async function executeBulkDispatch() {
    setShowDispatchModal(false);
    setBatchProcessing(true);
    try {
      const orderIdsToDispatch = dispatchValidation.ready.map((o) => o.id);
      const res = await fetch("/api/dispatch/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: orderIdsToDispatch,
          courierConfigId: bulkCourierId || undefined,
          pickupLocationId: bulkPickupLocationId || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process bulk dispatch");

      const resList: BulkResultItem[] = data.data || [];
      const successCount = resList.filter((r) => r.status === "dispatched").length;
      const failedCount = resList.filter((r) => r.status === "failed").length;

      setBulkResults({
        title: "Bulk Dispatch Results",
        summary: {
          total: orderIdsToDispatch.length,
          success: successCount,
          failed: failedCount
        },
        results: resList
      });
      setShowResultModal(true);
      setSelected([]);
      loadOrders();
      loadCounts();
    } catch (err: unknown) {
      setNotice({ text: err instanceof Error ? err.message : "Bulk dispatch failed", type: "error" });
    } finally {
      setBatchProcessing(false);
    }
  }

  // Single Actions
  async function handleSingleSkip(orderId: string) {
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/orders/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      if (!res.ok) throw new Error("Could not skip order");
      setNotice({ text: "Order removed from dispatch queue.", type: "info" });
      loadOrders();
      loadCounts();
    } catch (err: unknown) {
      setNotice({ text: err instanceof Error ? err.message : "Skip failed", type: "error" });
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
        body: JSON.stringify({ orderId })
      });
      if (!res.ok) throw new Error("Could not restore order");
      setNotice({ text: "Order restored to dispatch queue.", type: "success" });
      loadOrders();
      loadCounts();
    } catch (err: unknown) {
      setNotice({ text: err instanceof Error ? err.message : "Restore failed", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleSingleCancelDispatch(orderId: string) {
    if (!window.confirm("Cancel courier shipment for this order?")) return;
    setActionLoadingId(orderId);
    try {
      const res = await fetch("/api/dispatch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      if (!res.ok) throw new Error("Could not cancel dispatch");
      setNotice({ text: "Dispatch cancelled.", type: "info" });
      loadOrders();
      loadCounts();
    } catch (err: unknown) {
      setNotice({ text: err instanceof Error ? err.message : "Cancellation failed", type: "error" });
    } finally {
      setActionLoadingId(null);
    }
  }

  // Bulk Skip / Restore / Cancel
  async function executeBulkSkip() {
    setShowSkipModal(false);
    setBatchProcessing(true);
    try {
      await Promise.all(selected.map((orderId) => fetch("/api/orders/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: skipReason || undefined })
      })));
      setNotice({ text: `${selected.length} orders removed from dispatch queue.`, type: "info" });
      setSelected([]);
      loadOrders();
      loadCounts();
    } catch {
      setNotice({ text: "Failed to skip some orders.", type: "error" });
    } finally {
      setBatchProcessing(false);
    }
  }

  async function executeBulkRestore() {
    setBatchProcessing(true);
    try {
      await Promise.all(selected.map((orderId) => fetch("/api/orders/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      })));
      setNotice({ text: `${selected.length} orders restored to dispatch queue.`, type: "success" });
      setSelected([]);
      loadOrders();
      loadCounts();
    } catch {
      setNotice({ text: "Failed to restore some orders.", type: "error" });
    } finally {
      setBatchProcessing(false);
    }
  }

  async function executeBulkCancelDispatch() {
    setShowCancelModal(false);
    setBatchProcessing(true);
    try {
      await Promise.all(selected.map((orderId) => fetch("/api/dispatch/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: cancelReason || undefined })
      })));
      setNotice({ text: `${selected.length} courier dispatches cancelled.`, type: "info" });
      setSelected([]);
      loadOrders();
      loadCounts();
    } catch {
      setNotice({ text: "Failed to cancel some dispatches.", type: "error" });
    } finally {
      setBatchProcessing(false);
    }
  }

  return (
    <div className="space-y-2 w-full min-w-0 max-w-full">
      {/* ─── 1. TOP CONTROLS & SEARCH BAR ─── */}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-2xs w-full min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 w-full min-w-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={isDispatchedMode ? "Search dispatched orders, tracking, customer..." : "Search orders, customer, phone, SKU..."}
              className="h-8.5 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-7 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none transition-colors"
            />
            {search && (
              <button 
                onClick={() => {
                  setSearch("");
                  setPage(0);
                }} 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Quick Date Filters on Dispatched Mode */}
          {isDispatchedMode ? (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {DISPATCHED_DATE_SHORTCUTS.map((ds) => {
                const active = filterDate === ds.id;
                return (
                  <button
                    key={ds.id || "all-time"}
                    onClick={() => handleDateShortcut(ds.id)}
                    className={cn(
                      "h-8.5 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap",
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
          ) : (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {DATE_SHORTCUTS.map((ds) => {
                const active = filterDate === ds.id;
                return (
                  <button
                    key={ds.id}
                    onClick={() => handleDateShortcut(ds.id)}
                    className={cn(
                      "h-8.5 px-2.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap",
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
          )}

          {/* Filters Toggle Button */}
          <button
            onClick={() => setShowFiltersDrawer(true)}
            className={cn(
              "flex h-8.5 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors cursor-pointer shrink-0",
              activeFiltersCount > 0
                ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            )}
            title="Filter orders"
          >
            <SlidersHorizontal size={13} />
            <span className="hidden xs:inline">Filters</span>
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
            className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin text-slate-900")} />
          </button>
        </div>

        {/* ─── 2. PRIMARY TABS BAR (ORDERS MODE ONLY) ─── */}
        {!isDispatchedMode && (
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-100 pt-2 -mx-1 px-1">
            {ORDERS_TABS.map((t) => {
              const active = tab === t.id;
              const countVal = counts ? (counts[t.id as keyof TabCounts] ?? null) : null;

              return (
                <button
                  key={t.id}
                  onClick={() => handleTabChange(t.id)}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0 cursor-pointer",
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
        )}

        {/* Quick Date Pills on Mobile (Dispatched Mode Only) */}
        {isDispatchedMode && (
          <div className="flex sm:hidden items-center gap-1 overflow-x-auto no-scrollbar border-t border-slate-100 pt-2 -mx-1 px-1">
            {DISPATCHED_DATE_SHORTCUTS.map((ds) => {
              const active = filterDate === ds.id;
              return (
                <button
                  key={ds.id || "all-time-mobile"}
                  onClick={() => handleDateShortcut(ds.id)}
                  className={cn(
                    "h-6.5 px-2.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0",
                    active
                      ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {ds.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 3. TOP DESKTOP STICKY BULK ACTION BAR ─── */}
      {selected.length > 0 && (
        <div className="hidden md:flex sticky top-2 z-20 items-center justify-between gap-3 rounded-lg bg-slate-900 px-3.5 py-2 text-xs text-white shadow-md border border-slate-800 animate-in fade-in slide-in-from-top-1">
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

            {tab === "skipped" ? (
              <Button
                onClick={executeBulkRestore}
                disabled={batchProcessing}
                className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>Restore Selected ({selected.length})</span>
              </Button>
            ) : isDispatchedMode || tab === "dispatched" ? (
              <Button
                onClick={() => setShowCancelModal(true)}
                className="h-7 px-3 text-xs bg-red-600 hover:bg-red-500 text-white font-semibold rounded transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Ban size={13} />
                <span>Cancel Dispatch Selected ({selected.length})</span>
              </Button>
            ) : (
              <>
                <Button 
                  variant="secondary"
                  onClick={() => setShowSkipModal(true)}
                  className="h-7 px-2.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-medium rounded transition-all cursor-pointer"
                >
                  Remove from Dispatch
                </Button>

                <Button 
                  onClick={openBulkDispatchModal}
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
          "flex items-center justify-between rounded-lg px-3 py-2 text-xs border animate-in fade-in",
          notice.type === "success" && "bg-emerald-50 text-emerald-800 border-emerald-200",
          notice.type === "error" && "bg-red-50 text-red-800 border-red-200",
          notice.type === "info" && "bg-sky-50 text-sky-800 border-sky-200"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            {notice.type === "success" && <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />}
            {notice.type === "error" && <AlertCircle size={14} className="text-red-600 shrink-0" />}
            {notice.type === "info" && <RotateCcw size={14} className="text-sky-600 shrink-0" />}
            <span className="truncate">{notice.text}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 ml-2 cursor-pointer shrink-0">
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

      {/* ─── 5. MOBILE SELECT ALL STRIP (MOBILE ONLY) ─── */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-200 text-xs shadow-2xs">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allEligibleOnPageSelected}
            ref={(input) => {
              if (input) input.indeterminate = someEligibleOnPageSelected;
            }}
            onChange={toggleSelectAllPage}
            className="size-4 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
          />
          <span className="font-semibold text-slate-800 text-[11px]">
            {selected.length > 0 ? `${selected.length} Selected` : "Select All"}
          </span>
        </label>

        <span className="text-[11px] text-slate-500 font-medium font-mono">
          {orders.length} order{orders.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ─── 6. DESKTOP ORDERS TABLE (768px+) ─── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs w-full">
        <table className="w-full text-left border-collapse min-w-[700px]">
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
                  <p className="font-semibold text-slate-800">
                    {isDispatchedMode ? "No dispatched orders found" : "No orders found"}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {search 
                      ? "No orders match your search criteria." 
                      : isDispatchedMode 
                      ? "Orders successfully sent to couriers will appear here." 
                      : "No orders found for this filter."}
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
                const isDispatching = order.dispatch_status === "dispatching" || actionLoadingId === order.id;

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
                        <DispatchBadge status="SKIPPED" />
                      ) : (
                        <div>
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
                          {isFailed && dispatchRecord?.safe_error_message && (
                            <span 
                              className="text-[10px] text-red-600 block max-w-[170px] truncate mt-0.5 cursor-help font-medium" 
                              title={dispatchRecord.safe_error_message}
                            >
                              ⚠ {dispatchRecord.safe_error_message}
                            </span>
                          )}
                        </div>
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
                            onClick={() => openSingleDispatchModal(order)}
                            disabled={isDispatching}
                            className={cn(
                              "h-6.5 px-2.5 rounded text-white text-[11px] font-medium transition-all inline-flex items-center gap-1 shadow-2xs",
                              isDispatching
                                ? "bg-slate-400 cursor-not-allowed opacity-80"
                                : isFailed
                                ? "bg-amber-700 hover:bg-amber-600 cursor-pointer"
                                : "bg-slate-900 hover:bg-slate-800 cursor-pointer"
                            )}
                          >
                            {isDispatching ? (
                              <>
                                <RefreshCw size={11} className="animate-spin" />
                                <span>Dispatching…</span>
                              </>
                            ) : (
                              <>
                                <Truck size={11} />
                                <span>{isFailed ? "Retry" : "Dispatch"}</span>
                              </>
                            )}
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

      {/* ─── 7. MOBILE HIGH-DENSITY ORDER CARDS (320px - 767px) ─── */}
      <div className="md:hidden divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs w-full">
        {loading && orders.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <RefreshCw size={16} className="mx-auto animate-spin mb-1 text-slate-400" />
            <p className="text-xs font-medium">Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-slate-500 px-4">
            <p className="font-semibold text-xs text-slate-800">
              {isDispatchedMode ? "No dispatched orders found" : "No orders found"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isDispatchedMode ? "Orders sent to couriers will appear here." : "No orders match this status or filter."}
            </p>
          </div>
        ) : (
          orders.map((order) => {
            const isSelected = selectedSet.has(order.id);
            const dispatchRecord = order.dispatches?.[0];
            const tracking = dispatchRecord?.tracking_id;
            const isDispatched = order.dispatch_status === "dispatched";
            const isCancelled = Boolean(order.cancelled_at);
            const isSkipped = order.is_skipped;
            const isFailed = order.dispatch_status === "failed";
            const isDispatching = order.dispatch_status === "dispatching" || actionLoadingId === order.id;

            const fulfillmentStatus = isCancelled 
              ? "CANCELLED" 
              : (order.fulfillment_status || "UNFULFILLED");

            return (
              <div 
                key={order.id}
                className={cn(
                  "p-2.5 sm:p-3 flex items-start gap-2 transition-colors",
                  isSelected && "bg-blue-50/40"
                )}
              >
                {/* Checkbox (Comfortable touch hit area) */}
                <label className="flex size-7 shrink-0 items-center justify-center -ml-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectOrder(order)}
                    className="size-4 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                  />
                </label>

                {/* Core Order Content */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: Order # + Total Amount */}
                  <div className="flex items-baseline justify-between gap-2">
                    <Link 
                      href={`/orders/${order.id}`}
                      className="font-bold font-mono text-slate-900 text-xs hover:text-blue-600 truncate flex items-center gap-1"
                    >
                      {order.name}
                    </Link>
                    <span className="font-bold text-slate-900 text-xs shrink-0">
                      {money(order.total_minor, order.currency)}
                    </span>
                  </div>

                  {/* Row 2: Customer Name + Phone */}
                  <div className="flex items-center justify-between gap-1 text-[11px] text-slate-600 mt-0.5">
                    <span className="font-medium text-slate-800 truncate">{order.customer_name || "Customer"}</span>
                    {order.customer_phone ? (
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">{order.customer_phone}</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium shrink-0">No phone</span>
                    )}
                  </div>

                  {/* Row 3: Status Badges + Action */}
                  <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 mt-1.5 pt-1.5 border-t border-slate-50">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <FulfillmentBadge size="sm" short status={fulfillmentStatus} />
                      <PaymentBadge size="sm" short status={order.financial_status} />
                      {isSkipped ? (
                        <DispatchBadge size="sm" status="SKIPPED" />
                      ) : (
                        <DispatchBadge size="sm" status={order.dispatch_status} tracking={tracking} />
                      )}
                      <span className="text-slate-400">{fmtShortDate(order.shopify_created_at || order.shopify_updated_at)}</span>
                      {isFailed && dispatchRecord?.safe_error_message && (
                        <span 
                          className="text-[10px] text-red-600 font-medium block truncate max-w-[200px]"
                          title={dispatchRecord.safe_error_message}
                        >
                          ⚠ {dispatchRecord.safe_error_message}
                        </span>
                      )}
                    </div>

                    {!isCancelled && (
                      <div className="shrink-0 pl-1">
                        {isSkipped ? (
                          <button
                            onClick={() => handleSingleRestore(order.id)}
                            className="h-6.5 px-2.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-semibold cursor-pointer"
                          >
                            Restore
                          </button>
                        ) : isDispatched ? (
                          <button
                            onClick={() => handleSingleCancelDispatch(order.id)}
                            className="h-6.5 px-2 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={() => openSingleDispatchModal(order)}
                            disabled={isDispatching}
                            className={cn(
                              "h-6.5 px-2.5 rounded text-white text-[10px] font-semibold inline-flex items-center gap-1 shadow-2xs",
                              isDispatching
                                ? "bg-slate-400 cursor-not-allowed opacity-80"
                                : isFailed
                                ? "bg-amber-600 hover:bg-amber-500 cursor-pointer"
                                : "bg-slate-900 hover:bg-slate-800 cursor-pointer"
                            )}
                          >
                            {isDispatching ? (
                              <>
                                <RefreshCw size={10} className="animate-spin" />
                                <span>Dispatching…</span>
                              </>
                            ) : (
                              <>
                                <Truck size={10} />
                                <span>{isFailed ? "Retry" : "Dispatch"}</span>
                              </>
                            )}
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

      {/* ─── 8. BOTTOM PAGINATION BAR ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white px-3 sm:px-4 py-2.5 rounded-xl border border-slate-200 text-xs shadow-2xs w-full">
        <div className="text-slate-500 text-[11px] text-center sm:text-left">
          Showing <span className="font-semibold text-slate-800">{startItem}–{endItem}</span> of <span className="font-semibold text-slate-800">{totalCount.toLocaleString()}</span> orders
        </div>

        <div className="flex items-center gap-2">
          {/* Page Size selector */}
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className="hidden xs:inline">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              className="h-7 rounded border border-slate-200 bg-slate-50 px-1.5 text-xs text-slate-800 focus:outline-none cursor-pointer"
            >
              {PAGE_SIZES.map((sz) => (
                <option key={sz} value={sz}>{sz}</option>
              ))}
            </select>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer"
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              <span className="px-2 text-xs font-semibold text-slate-800 font-mono">
                {page + 1} / {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 transition-colors cursor-pointer"
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── 9. MOBILE FLOATING BULK ACTION BAR ─── */}
      {selected.length > 0 && (
        <div className="md:hidden fixed inset-x-2 sm:inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+54px)] z-40 flex items-center justify-between gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs text-white shadow-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex size-5 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white shrink-0">
              {selected.length}
            </span>
            <span className="font-semibold text-xs truncate">{selected.length} selected</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => setSelected([])}
              className="text-slate-400 hover:text-white text-[11px] px-2 py-1 cursor-pointer"
            >
              Clear
            </button>

            {tab === "skipped" ? (
              <button
                onClick={executeBulkRestore}
                disabled={batchProcessing}
                className="h-7.5 px-3 rounded-lg bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Restore</span>
              </button>
            ) : isDispatchedMode || tab === "dispatched" ? (
              <button
                onClick={() => setShowCancelModal(true)}
                className="h-7.5 px-3 rounded-lg bg-red-600 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Ban size={12} />
                <span>Cancel</span>
              </button>
            ) : (
              <button 
                onClick={openBulkDispatchModal}
                disabled={dispatchValidation.ready.length === 0}
                className="h-7.5 px-3 rounded-lg bg-white text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Truck size={12} />
                <span>Dispatch ({dispatchValidation.ready.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── 10. MOBILE BOTTOM SHEET / FILTER DRAWER ─── */}
      {showFiltersDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in">
          <div className="w-full max-h-[85vh] sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white p-4 sm:p-5 shadow-2xl overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-slate-700" />
                <h3 className="text-sm font-bold text-slate-900">Filter Orders</h3>
              </div>
              <button 
                onClick={() => setShowFiltersDrawer(false)}
                className="size-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Date Filters */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">Date Range</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {DATE_SHORTCUTS.map((ds) => (
                  <button
                    key={ds.id}
                    onClick={() => handleDateShortcut(ds.id)}
                    className={cn(
                      "h-8 rounded-lg text-xs font-medium border transition-colors cursor-pointer",
                      filterDate === ds.id
                        ? "bg-slate-900 text-white border-slate-900 font-semibold"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {ds.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">Payment Status</label>
              <select
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
              >
                <option value="all">All Payment Statuses</option>
                <option value="pending">Pending / Cash on Delivery (COD)</option>
                <option value="paid">Paid (Prepaid)</option>
                <option value="authorized">Authorized</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            {/* Fulfillment Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">Fulfillment Status</label>
              <select
                value={filterFulfillment}
                onChange={(e) => setFilterFulfillment(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
              >
                <option value="all">All Fulfillment Statuses</option>
                <option value="unfulfilled">Unfulfilled</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="on_hold">On Hold</option>
                <option value="partially_fulfilled">Partially Fulfilled</option>
              </select>
            </div>

            {/* Courier Filter */}
            {availableCouriers.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Courier Provider</label>
                <select
                  value={filterCourier}
                  onChange={(e) => setFilterCourier(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Couriers</option>
                  {availableCouriers.map((c) => (
                    <option key={c.id} value={c.name.toLowerCase()}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Drawer Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="secondary"
                onClick={clearAllFilters}
                className="flex-1 h-9 text-xs"
              >
                Clear All
              </Button>
              <Button
                onClick={() => {
                  setPage(0);
                  setShowFiltersDrawer(false);
                }}
                className="flex-1 h-9 text-xs bg-slate-900 hover:bg-slate-800 text-white"
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 11. SINGLE & BULK DISPATCH CONFIRMATION BOTTOM SHEET / MODAL ─── */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in">
          <div className="w-full max-h-[90vh] sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-4 sm:p-6 shadow-2xl overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Truck size={16} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {singleDispatchOrder ? `Dispatch Order ${singleDispatchOrder.name}` : `Dispatch Selected Orders (${dispatchValidation.ready.length})`}
                </h3>
              </div>
              <button 
                onClick={() => setShowDispatchModal(false)}
                className="size-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {singleDispatchOrder ? (
              /* Single Order Details Preview */
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-slate-900">{singleDispatchOrder.customer_name || "Customer"}</span>
                  <span className="font-mono text-slate-900">{money(singleDispatchOrder.total_minor, singleDispatchOrder.currency)}</span>
                </div>
                <p className="text-slate-500 text-[11px] font-mono">{singleDispatchOrder.customer_phone || "No phone provided"}</p>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  {Object.values(singleDispatchOrder.shipping_address || {}).filter(Boolean).join(", ")}
                </p>
              </div>
            ) : (
              /* Bulk Orders Batch Summary */
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Ready for Dispatch:</span>
                  <span className="font-bold text-emerald-700">{dispatchValidation.ready.length} orders</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Estimated Total COD:</span>
                  <span className="font-bold text-slate-900 font-mono">{money(dispatchValidation.estimatedCodMinor, "BDT")}</span>
                </div>
                {dispatchValidation.needAttention.length > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    ⚠ {dispatchValidation.needAttention.length} selected orders have missing details or are already dispatched and will be skipped.
                  </p>
                )}
              </div>
            )}

            {/* Courier Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">Select Courier Service</label>
              <select
                value={singleDispatchOrder ? singleDispatchCourierId : bulkCourierId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (singleDispatchOrder) {
                    setSingleDispatchCourierId(val);
                    const locationsData = courierPickupMap[val];
                    const defaultLoc = locationsData?.locations?.find((l) => l.id === locationsData.defaultLocationId || l.isDefault) || locationsData?.locations?.[0];
                    setSingleDispatchPickupLocationId(defaultLoc?.id || "");
                  } else {
                    setBulkCourierId(val);
                    const locationsData = courierPickupMap[val];
                    const defaultLoc = locationsData?.locations?.find((l) => l.id === locationsData.defaultLocationId || l.isDefault) || locationsData?.locations?.[0];
                    setBulkPickupLocationId(defaultLoc?.id || "");
                  }
                }}
                className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {availableCouriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Pickup Location Selection */}
            {(() => {
              const activeCourierId = singleDispatchOrder ? singleDispatchCourierId : bulkCourierId;
              const locationsData = courierPickupMap[activeCourierId];
              const locations = locationsData?.locations || [];

              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      <MapPin size={12} className="text-slate-500" />
                      <span>Pickup Warehouse / Branch</span>
                    </label>
                    <span className="text-[10px] text-slate-400">{locations.length} available</span>
                  </div>

                  {locations.length > 0 ? (
                    <select
                      value={singleDispatchOrder ? singleDispatchPickupLocationId : bulkPickupLocationId}
                      onChange={(e) => {
                        if (singleDispatchOrder) setSingleDispatchPickupLocationId(e.target.value);
                        else setBulkPickupLocationId(e.target.value);
                      }}
                      className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.area ? `(${loc.area})` : ""} {loc.isDefault ? "★ Default" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      No pickup locations synchronized for this courier. Please visit Settings → Couriers to refresh locations.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                onClick={() => setShowDispatchModal(false)}
                className="flex-1 h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={singleDispatchOrder ? executeSingleDispatch : executeBulkDispatch}
                disabled={batchProcessing}
                className="flex-1 h-9 text-xs bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                {batchProcessing ? "Processing Dispatch…" : "Confirm Dispatch"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 12. RESULTS MODAL ─── */}
      {showResultModal && bulkResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">{bulkResults.title}</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="rounded-md bg-emerald-50 text-emerald-800 px-2.5 py-1 font-semibold border border-emerald-200">
                ✓ {bulkResults.summary.success} Successful
              </span>
              {bulkResults.summary.failed > 0 && (
                <span className="rounded-md bg-red-50 text-red-800 px-2.5 py-1 font-semibold border border-red-200">
                  ⚠ {bulkResults.summary.failed} Failed
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 text-xs">
              {bulkResults.results.map((r) => (
                <div key={r.orderId} className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 font-mono">{r.orderName}</span>
                    {r.reason && <p className="text-[11px] text-red-600 truncate mt-0.5">{r.reason}</p>}
                    {r.trackingId && <p className="text-[11px] text-emerald-600 font-mono mt-0.5">Tracking: {r.trackingId}</p>}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    r.status === "dispatched" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  )}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>

            <Button
              onClick={() => setShowResultModal(false)}
              className="w-full h-9 text-xs bg-slate-900 text-white font-bold"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

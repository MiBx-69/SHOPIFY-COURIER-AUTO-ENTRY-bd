"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Check, Copy, RotateCcw } from "lucide-react";

export type BadgeSize = "sm" | "md";

interface BadgeConfig {
  label: string;
  className: string;
  dot: string;
}

const fulfillmentConfigs: Record<string, BadgeConfig> = {
  CANCELLED: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200/80", dot: "bg-red-500" },
  FULFILLED: { label: "Fulfilled", className: "bg-emerald-50 text-emerald-700 border-emerald-200/80", dot: "bg-emerald-500" },
  PARTIALLY_FULFILLED: { label: "Partially Fulfilled", className: "bg-teal-50 text-teal-700 border-teal-200/80", dot: "bg-teal-500" },
  ON_HOLD: { label: "On Hold", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  UNFULFILLED: { label: "Unfulfilled", className: "bg-blue-50 text-blue-700 border-blue-200/80", dot: "bg-blue-500" },
  DELIVERED: { label: "Delivered", className: "bg-emerald-50 text-emerald-800 border-emerald-200/80", dot: "bg-emerald-600" },
  RETURNED: { label: "Returned", className: "bg-orange-50 text-orange-800 border-orange-200/80", dot: "bg-orange-500" },
  UNKNOWN: { label: "Unknown", className: "bg-slate-100 text-slate-700 border-slate-200/80", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200/80", dot: "bg-blue-400" },
  PENDING_FULFILLMENT: { label: "Pending Fulfillment", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  SCHEDULED: { label: "Scheduled", className: "bg-indigo-50 text-indigo-700 border-indigo-200/80", dot: "bg-indigo-500" },
  REQUEST_DECLINED: { label: "Request Declined", className: "bg-red-50 text-red-700 border-red-200/80", dot: "bg-red-500" },
  RESTOCKED: { label: "Restocked", className: "bg-slate-100 text-slate-700 border-slate-200/80", dot: "bg-slate-500" }
};

export function FulfillmentBadge({ status, size = "md", className, short = false }: { status: string | null | undefined; size?: BadgeSize; className?: string; short?: boolean }) {
  const normalized = (status || "UNFULFILLED").toUpperCase().replace(/\s+/g, "_");
  const cfg = fulfillmentConfigs[normalized] || fulfillmentConfigs.UNFULFILLED;
  const label = short && normalized === "PARTIALLY_FULFILLED" ? "Partial" : cfg.label;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors", size === "sm" ? "px-2 py-0.5 text-[10px] leading-tight" : "px-2.5 py-0.5 text-[11px] leading-normal", cfg.className, className)}><span className={cn("rounded-full shrink-0 size-1.5", cfg.dot)} />{label}</span>;
}

const paymentConfigs: Record<string, BadgeConfig> = {
  PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200/80", dot: "bg-emerald-500" },
  PENDING: { label: "COD / Pending", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  COD: { label: "COD", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  AUTHORIZED: { label: "Authorized", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  PARTIALLY_PAID: { label: "Partially Paid", className: "bg-blue-50 text-blue-700 border-blue-200/80", dot: "bg-blue-500" },
  REFUNDED: { label: "Refunded", className: "bg-purple-50 text-purple-700 border-purple-200/80", dot: "bg-purple-500" },
  PARTIALLY_REFUNDED: { label: "Part. Refunded", className: "bg-purple-50 text-purple-700 border-purple-200/80", dot: "bg-purple-500" },
  VOIDED: { label: "Voided", className: "bg-red-50 text-red-700 border-red-200/80", dot: "bg-red-500" },
  EXPIRED: { label: "Expired", className: "bg-slate-100 text-slate-600 border-slate-200/80", dot: "bg-slate-400" }
};

export function PaymentBadge({ status, size = "md", className, short = false }: { status: string | null | undefined; size?: BadgeSize; className?: string; short?: boolean }) {
  const normalized = (status || "PENDING").toUpperCase().replace(/\s+/g, "_");
  const cfg = paymentConfigs[normalized] || paymentConfigs.PENDING;
  const label = short && (normalized === "PENDING" || normalized === "COD") ? "COD" : cfg.label;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors", size === "sm" ? "px-2 py-0.5 text-[10px] leading-tight" : "px-2.5 py-0.5 text-[11px] leading-normal", cfg.className, className)}><span className={cn("rounded-full shrink-0 size-1.5", cfg.dot)} />{label}</span>;
}

const dispatchConfigs: Record<string, BadgeConfig> = {
  NOT_DISPATCHED: { label: "Pending", className: "bg-slate-100 text-slate-600 border-slate-200/80", dot: "bg-slate-400" },
  PENDING: { label: "Pending", className: "bg-slate-100 text-slate-600 border-slate-200/80", dot: "bg-slate-400" },
  DISPATCHING: { label: "Dispatching", className: "bg-indigo-50 text-indigo-700 border-indigo-200/80", dot: "bg-indigo-500" },
  DISPATCHED: { label: "Dispatched", className: "bg-purple-50 text-purple-700 border-purple-200/80", dot: "bg-purple-500" },
  PICKED_UP: { label: "Picked Up", className: "bg-blue-50 text-blue-700 border-blue-200/80", dot: "bg-blue-500" },
  IN_TRANSIT: { label: "In Transit", className: "bg-cyan-50 text-cyan-800 border-cyan-200/80", dot: "bg-cyan-500" },
  DELIVERED: { label: "Delivered", className: "bg-emerald-50 text-emerald-800 border-emerald-200/80", dot: "bg-emerald-500" },
  RETURNED: { label: "Returned", className: "bg-orange-50 text-orange-800 border-orange-200/80", dot: "bg-orange-500" },
  FAILED: { label: "Failed", className: "bg-rose-50 text-rose-700 border-rose-200/80", dot: "bg-rose-500" },
  SKIPPED: { label: "Skipped", className: "bg-slate-100 text-slate-600 border-slate-200/80", dot: "bg-slate-400" },
  CANCELLED: { label: "Cancelled", className: "bg-red-50 text-red-700 border-red-200/80", dot: "bg-red-500" }
};

function getCurrentOrderId(element: HTMLElement, explicitOrderId?: string) {
  if (explicitOrderId) return explicitOrderId;
  const pathMatch = window.location.pathname.match(/\/orders\/([^/?#]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    const href = current.querySelector<HTMLAnchorElement>('a[href^="/orders/"]')?.getAttribute("href");
    if (href) return href.split("/")[2] || null;
  }
  return null;
}

async function redispatchFromBadge(element: HTMLElement, explicitOrderId?: string) {
  const orderId = getCurrentOrderId(element, explicitOrderId);
  if (!orderId) {
    window.alert("Could not determine the order to redispatch.");
    return;
  }
  try {
    const response = await fetch("/api/dispatch/redispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, idempotencyKey: crypto.randomUUID() })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) throw new Error(body.error || "Redispatch failed");
    window.location.reload();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Redispatch failed");
  }
}

export function DispatchBadge({ status, tracking, size = "md", copied = false, onCopy, className, orderId }: { status: string | null | undefined; tracking?: string | null; size?: BadgeSize; copied?: boolean; onCopy?: (tracking: string) => void; className?: string; orderId?: string }) {
  const normalized = (status || "PENDING").toUpperCase().replace(/\s+/g, "_");
  const cfg = dispatchConfigs[normalized] || dispatchConfigs.PENDING;
  const canRedispatch = normalized === "FAILED" || normalized === "SKIPPED";
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors", size === "sm" ? "px-2 py-0.5 text-[10px] leading-tight" : "px-2.5 py-0.5 text-[11px] leading-normal", cfg.className)}><span className={cn("rounded-full shrink-0 size-1.5", cfg.dot)} />{cfg.label}</span>
      {tracking && onCopy && <button onClick={(e) => { e.stopPropagation(); onCopy(tracking); }} title="Copy tracking ID" className="group inline-flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 hover:text-slate-900 transition-colors border border-slate-200/70"><span>{tracking}</span>{copied ? <Check size={10} className="text-emerald-600 shrink-0" /> : <Copy size={10} className="opacity-40 group-hover:opacity-100 shrink-0" />}</button>}
      {canRedispatch && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); void redispatchFromBadge(e.currentTarget, orderId); }} title="Redispatch this order" className={cn("inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900", size === "sm" ? "text-[9px]" : "text-[10px]")}><RotateCcw size={size === "sm" ? 9 : 10} />Redispatch</button>}
    </div>
  );
}

export type IntegrationStatus = "connected" | "not_configured" | "failed" | "auth_error" | "network_error" | "provider_error" | "disabled" | string;
const integrationConfigs: Record<string, BadgeConfig> = {
  connected: { label: "Connected", className: "bg-emerald-50 text-emerald-700 border-emerald-200/80", dot: "bg-emerald-500" },
  healthy: { label: "Connected", className: "bg-emerald-50 text-emerald-700 border-emerald-200/80", dot: "bg-emerald-500" },
  not_configured: { label: "Not configured", className: "bg-slate-100 text-slate-600 border-slate-200/80", dot: "bg-slate-400" },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  failed: { label: "Failed", className: "bg-red-50 text-red-700 border-red-200/80", dot: "bg-red-500" },
  disconnected: { label: "Disconnected", className: "bg-slate-100 text-slate-500 border-slate-200/80", dot: "bg-slate-400" },
  auth_error: { label: "Auth error", className: "bg-amber-50 text-amber-800 border-amber-200/80", dot: "bg-amber-500" },
  disabled: { label: "Disabled", className: "bg-slate-100 text-slate-500 border-slate-200/80", dot: "bg-slate-300" }
};

export function StatusBadge({ status, className }: { status: IntegrationStatus; className?: string }) {
  const cfg = integrationConfigs[status] ?? integrationConfigs.not_configured;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", cfg.className, className)}><span className={cn("size-1.5 rounded-full shrink-0", cfg.dot)} />{cfg.label}</span>;
}

"use client";
import { useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type ShopData = {
  id: string;
  name: string;
  shop_domain: string;
  connection_status: string;
  last_synced_at: string | null;
  ordersCount?: number;
  webhooksCount?: number;
  shopify_installations: {
    scopes: string[];
    api_version: string | null;
    last_tested_at: string | null;
    last_test_status: string | null;
    last_error_message: string | null;
  } | null;
};

function fmt(dateStr: string | null) {
  if (!dateStr) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

export function ShopifyCard({ shop }: { shop: ShopData }) {
  const installation = shop.shopify_installations;
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
    latencyMs?: number;
    testedAt?: string;
    shopName?: string;
    plan?: string;
    apiVersion?: string;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function testConnection() {
    setBusy(true);
    setTestResult(null);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shopify/test?shopId=${encodeURIComponent(shop.id)}`, {
        method: "POST"
      });
      const json = await res.json() as {
        data?: { connected: boolean; latencyMs: number; testedAt: string; shopName: string; plan?: string; apiVersion: string };
        error?: string;
      };
      if (res.ok && json.data?.connected) {
        setTestResult({
          ok: true,
          msg: "Shopify connection verified",
          latencyMs: json.data.latencyMs,
          testedAt: json.data.testedAt,
          shopName: json.data.shopName,
          plan: json.data.plan,
          apiVersion: json.data.apiVersion
        });
      } else {
        setTestResult({ ok: false, msg: json.error ?? "Shopify connection test failed" });
      }
    } catch {
      setTestResult({ ok: false, msg: "Network error — please try again" });
    }
    setBusy(false);
  }

  async function syncNow() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shopify/sync?shopId=${encodeURIComponent(shop.id)}`, {
        method: "POST"
      });
      if (res.ok) {
        setStatusMsg("Sync completed successfully.");
      } else {
        setStatusMsg("Failed to queue sync job.");
      }
    } catch {
      setStatusMsg("Network error — please try again");
    }
    setBusy(false);
  }

  async function disconnectShop() {
    if (!window.confirm("Are you sure you want to disconnect this Shopify store? This will pause all sync operations.")) return;
    setBusy(true);
    try {
      // In a real implementation this would call an API to mark the connection_status as disconnected
      alert("Please uninstall the application from the Shopify Admin panel to fully disconnect.");
    } finally {
      setBusy(false);
    }
  }

  const scopes = installation?.scopes ?? [];
  const apiVersion = testResult?.apiVersion ?? installation?.api_version ?? "—";
  const status = shop.connection_status === "healthy" ? "connected"
    : shop.connection_status === "disconnected" ? "failed"
    : "not_configured";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#96bf48]/10 text-xl">
            🛍️
          </div>
          <div>
            <p className="font-semibold text-slate-900">{shop.name}</p>
            <p className="text-sm text-slate-500">{shop.shop_domain}</p>
            <StatusBadge status={status} className="mt-1" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={testConnection}
            disabled={busy}
            className="h-8 px-3 text-xs"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : "Test connection"}
          </Button>
          <Button
            variant="ghost"
            onClick={syncNow}
            disabled={busy}
            className="h-8 px-3 text-xs"
          >
            <RefreshCw size={12} className={cn("mr-1", busy && "animate-spin")} />
            Sync now
          </Button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div
          className={cn(
            "flex items-center gap-2 border-t px-5 py-3 text-sm",
            testResult.ok
              ? "border-emerald-100 bg-emerald-50 text-emerald-800"
              : "border-red-100 bg-red-50 text-red-800"
          )}
        >
          {testResult.ok
            ? <CheckCircle2 size={15} className="shrink-0" />
            : <XCircle size={15} className="shrink-0" />}
          <span className="flex-1">{testResult.msg}</span>
          {testResult.latencyMs !== undefined && (
            <span className="text-xs opacity-70">{testResult.latencyMs} ms</span>
          )}
        </div>
      )}

      {/* Detail grid */}
      <div className="border-t border-slate-100 px-5 py-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3 md:grid-cols-4">
          <div>
            <p className="font-medium text-slate-700">API version</p>
            <p className="text-slate-500">{apiVersion}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Orders synced</p>
            <p className="text-slate-500">{shop.ordersCount !== undefined ? shop.ordersCount : "—"}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Webhooks received</p>
            <p className="text-slate-500">{shop.webhooksCount !== undefined ? shop.webhooksCount : "—"}</p>
          </div>
          <div>
            <p className="font-medium text-slate-700">Last synced</p>
            <p className="text-slate-500">{fmt(shop.last_synced_at)}</p>
          </div>
        </div>

        {/* Scopes */}
        {scopes.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-700">Authorized scopes</p>
            <div className="flex flex-wrap gap-1.5">
              {scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Last error */}
        {installation?.last_error_message && !testResult && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <XCircle size={14} className="mt-0.5 shrink-0" />
            <span>{installation.last_error_message}</span>
          </div>
        )}

        {/* Action links */}
        <div className="mt-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-slate-500">
            <span>Need to reconnect?</span>
            <a
              href={`/api/shopify/install?shop=${encodeURIComponent(shop.shop_domain)}`}
              className="font-semibold text-slate-800 underline underline-offset-2 hover:text-slate-950"
            >
              Reconnect via Shopify OAuth →
            </a>
          </div>
          <button 
            onClick={disconnectShop}
            disabled={busy}
            className="text-red-600 font-medium hover:text-red-800"
          >
            Disconnect Store
          </button>
        </div>
        {statusMsg && (
          <p role="status" className="mt-3 rounded-xl bg-slate-50 p-2 text-center text-sm font-medium text-slate-700 border border-slate-100">{statusMsg}</p>
        )}
      </div>
    </div>
  );
}

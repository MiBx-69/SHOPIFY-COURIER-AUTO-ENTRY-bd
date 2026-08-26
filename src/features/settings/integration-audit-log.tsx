"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  "shopify.connected": "Shopify connected",
  "shopify.connection_tested": "Shopify connection tested",
  "redx.credentials_configured": "RedX credentials configured",
  "redx.credentials_replaced": "RedX credentials replaced",
  "redx.connection_tested": "RedX connection tested",
  "redx.enabled": "RedX enabled",
  "redx.disabled": "RedX disabled",
  "redx.removed": "RedX removed",
  "pathao.credentials_configured": "Pathao credentials configured",
  "pathao.credentials_replaced": "Pathao credentials replaced",
  "pathao.connection_tested": "Pathao connection tested",
  "pathao.enabled": "Pathao enabled",
  "pathao.disabled": "Pathao disabled",
  "pathao.removed": "Pathao removed",
  "steadfast.credentials_configured": "Steadfast credentials configured",
  "steadfast.credentials_replaced": "Steadfast credentials replaced",
  "steadfast.connection_tested": "Steadfast connection tested",
  "steadfast.enabled": "Steadfast enabled",
  "steadfast.disabled": "Steadfast disabled",
  "steadfast.removed": "Steadfast removed"
};

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(dateStr));
}

export function IntegrationAuditLog({ shopId }: { shopId: string }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("audit_logs")
        .select("id,action,entity_type,metadata,created_at,actor_id")
        .eq("shop_id", shopId)
        .in("entity_type", ["shop", "courier_config"])
        .order("created_at", { ascending: false })
        .limit(30);

      if (err) {
        setError("Unable to load audit history");
      } else {
        setLogs((data ?? []) as AuditEntry[]);
      }
      setLoading(false);
    }
    void load();
  }, [shopId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        Loading audit history…
      </div>
    );
  }

  if (error) {
    return <p className="py-2 text-sm text-red-600">{error}</p>;
  }

  if (logs.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-400">No integration events recorded yet.</p>
    );
  }

  return (
    <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {logs.map((log) => {
        const label = ACTION_LABELS[log.action] ?? log.action;
        const meta = log.metadata ?? {};
        const result = typeof meta.result === "string" ? meta.result : null;
        const latency = typeof meta.latency_ms === "number" ? meta.latency_ms : null;

        return (
          <div key={log.id} className="flex items-start gap-3 px-4 py-3">
            <div
              className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                result === "connected" || result === undefined
                  ? "bg-emerald-400"
                  : result === "failed"
                  ? "bg-red-400"
                  : "bg-slate-300"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
              {latency !== null && (
                <p className="text-xs text-slate-400">{latency} ms</p>
              )}
            </div>
            <p className="shrink-0 text-xs text-slate-400">{fmt(log.created_at)}</p>
          </div>
        );
      })}
    </div>
  );
}

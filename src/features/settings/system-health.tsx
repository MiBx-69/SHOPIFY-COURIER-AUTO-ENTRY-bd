"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, RefreshCcw, Loader2, CheckCircle2, AlertCircle, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type ServiceStatus = "healthy" | "degraded" | "offline" | "loading";

interface ServiceResult {
  status: ServiceStatus;
  latencyMs?: number;
}

interface HealthData {
  status: ServiceStatus;
  responseMs?: number;
  services?: {
    database?: ServiceResult;
    redis?: ServiceResult;
    couriers?: {
      redx?: ServiceResult;
      pathao?: ServiceResult;
      steadfast?: ServiceResult;
    };
  };
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const colors: Record<ServiceStatus, string> = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-400",
    offline: "bg-red-500",
    loading: "bg-slate-300 animate-pulse",
  };
  return <span className={`inline-block size-2 rounded-full shrink-0 ${colors[status]}`} />;
}

function StatusBadge({ status, latencyMs }: ServiceResult) {
  const labels: Record<ServiceStatus, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    offline: "Offline",
    loading: "Checking…",
  };
  const colors: Record<ServiceStatus, string> = {
    healthy: "text-emerald-700 bg-emerald-50",
    degraded: "text-amber-700 bg-amber-50",
    offline: "text-red-700 bg-red-50",
    loading: "text-slate-500 bg-slate-50",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[status]}`}>
        {labels[status]}
      </span>
      {latencyMs !== undefined && status === "healthy" && (
        <span className="text-[10px] text-slate-400 font-mono">{latencyMs}ms</span>
      )}
    </div>
  );
}

const SERVICES: Array<{ key: string; label: string }> = [
  { key: "database", label: "Supabase Database" },
  { key: "redis", label: "Upstash Redis Cache" },
  { key: "redx", label: "REDX Courier" },
  { key: "pathao", label: "Pathao Courier" },
  { key: "steadfast", label: "Steadfast Courier" },
];

export function SystemHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json() as HealthData;
      setHealth(data);
      setLastChecked(new Date());
    } catch {
      setHealth({ status: "offline" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  function getServiceStatus(key: string): ServiceResult {
    if (loading || !health) return { status: "loading" };
    if (key === "database") return health.services?.database ?? { status: "offline" };
    if (key === "redis") return health.services?.redis ?? { status: "offline" };
    return (health.services?.couriers as Record<string, ServiceResult> | undefined)?.[key] ?? { status: "offline" };
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900">System Health</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastChecked && (
            <span className="text-[10px] text-slate-400 font-mono">
              Last checked: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <Button variant="secondary" className="text-xs h-7 py-1 px-2 min-h-7" onClick={check} disabled={loading}>
            {loading ? <Loader2 size={11} className="animate-spin mr-1" /> : <RefreshCcw size={11} className="mr-1" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall status banner */}
      {health && (
        <div className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-medium ${
          health.status === "healthy"
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
            : health.status === "degraded"
            ? "bg-amber-50 text-amber-800 border border-amber-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {health.status === "healthy" ? (
            <><CheckCircle2 size={13} /> All systems operational</>
          ) : health.status === "degraded" ? (
            <><AlertCircle size={13} /> Some services are degraded</>
          ) : (
            <><WifiOff size={13} /> System offline or unreachable</>
          )}
          {health.responseMs && (
            <span className="ml-auto text-[10px] font-mono opacity-60">{health.responseMs}ms total</span>
          )}
        </div>
      )}

      {/* Service grid */}
      <div className="divide-y divide-slate-100">
        {SERVICES.map(({ key, label }) => {
          const result = getServiceStatus(key);
          return (
            <div key={key} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2.5">
                <StatusDot status={result.status} />
                <span className="text-sm text-slate-700">{label}</span>
              </div>
              <StatusBadge {...result} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

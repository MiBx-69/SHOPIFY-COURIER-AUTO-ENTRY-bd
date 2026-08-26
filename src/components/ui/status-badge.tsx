import { cn } from "@/lib/utils";

export type IntegrationStatus =
  | "connected"
  | "not_configured"
  | "failed"
  | "auth_error"
  | "network_error"
  | "provider_error"
  | "disabled";

const config: Record<
  IntegrationStatus,
  { label: string; className: string; dot: string }
> = {
  connected: {
    label: "Connected",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    dot: "bg-emerald-500"
  },
  not_configured: {
    label: "Not configured",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    dot: "bg-slate-400"
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500"
  },
  auth_error: {
    label: "Auth error",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500"
  },
  network_error: {
    label: "Network error",
    className: "bg-orange-50 text-orange-700 ring-orange-200",
    dot: "bg-orange-500"
  },
  provider_error: {
    label: "Provider error",
    className: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500"
  },
  disabled: {
    label: "Disabled",
    className: "bg-slate-100 text-slate-500 ring-slate-200",
    dot: "bg-slate-300"
  }
};

export function StatusBadge({
  status,
  className
}: {
  status: IntegrationStatus | string;
  className?: string;
}) {
  const cfg = config[status as IntegrationStatus] ?? config.not_configured;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
        cfg.className,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

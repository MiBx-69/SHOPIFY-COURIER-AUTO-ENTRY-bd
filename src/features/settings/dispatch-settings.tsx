"use client";
import { useEffect, useState } from "react";
import { Loader2, ArrowUp, ArrowDown, Plus, Trash2, Route, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type CourierConfig = {
  id: string;
  enabled: boolean;
  priority: number;
  couriers: { display_name: string; provider: string };
};

type RoutingRule = {
  id?: string;
  shipping_method_pattern: string;
  match_type: "exact" | "contains";
  courier_config_id: string;
  priority: number;
  enabled: boolean;
};

export function DispatchSettings({
  shopId,
  initialAutomatic,
  configs
}: {
  shopId: string;
  initialAutomatic: boolean;
  configs: CourierConfig[];
}) {
  const [automatic, setAutomatic] = useState(initialAutomatic);
  const [redispatchEnabled, setRedispatchEnabled] = useState(true);
  const [routingEnabled, setRoutingEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingRouting, setLoadingRouting] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [rules, setRules] = useState<RoutingRule[]>([]);

  const enabledConfigs = [...configs].filter(c => c.enabled).sort((a, b) => a.priority - b.priority);
  const redx = enabledConfigs.find(c => c.couriers.provider === "redx");
  const pathao = enabledConfigs.find(c => c.couriers.provider === "pathao");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shops/${shopId}/shipping-routing`);
        if (!res.ok) throw new Error("Failed to load routing settings");
        const body = await res.json();
        if (cancelled) return;
        setRedispatchEnabled(body.data?.redispatch_enabled !== false);
        setRoutingEnabled(Boolean(body.data?.shipping_method_routing_enabled));
        setRules((body.data?.rules || []).map((rule: RoutingRule) => ({
          ...rule,
          priority: Number(rule.priority || 100),
          enabled: rule.enabled !== false
        })));
      } catch (error) {
        if (!cancelled) setStatusMsg(error instanceof Error ? error.message : "Failed to load routing settings.");
      } finally {
        if (!cancelled) setLoadingRouting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId]);

  async function toggleAutomatic() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const next = !automatic;
      const res = await fetch(`/api/shops/${shopId}/dispatch-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automatic_courier: next })
      });
      if (!res.ok) throw new Error("Failed to update setting.");
      setAutomatic(next);
      setStatusMsg(`Automatic courier selection is now ${next ? "ON" : "OFF"}.`);
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function movePriority(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === enabledConfigs.length - 1) return;

    const newConfigs = [...enabledConfigs];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newConfigs[index];
    newConfigs[index] = newConfigs[targetIndex];
    newConfigs[targetIndex] = temp;
    setBusy(true);

    try {
      await Promise.all(newConfigs.map((c, i) => fetch(`/api/couriers/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: i + 1 })
      })));
      setStatusMsg("Courier priority saved.");
    } catch {
      setStatusMsg("Network error saving priority.");
    } finally {
      setBusy(false);
    }
  }

  function addRule(pattern = "", courierConfigId = enabledConfigs[0]?.id || "") {
    setRules((current) => [
      ...current,
      {
        shipping_method_pattern: pattern,
        match_type: "contains",
        courier_config_id: courierConfigId,
        priority: current.length + 1,
        enabled: true
      }
    ]);
  }

  function addCommonBangladeshRules() {
    const next: RoutingRule[] = [];
    if (redx) next.push({ shipping_method_pattern: "Inside Dhaka", match_type: "contains", courier_config_id: redx.id, priority: 1, enabled: true });
    if (pathao) next.push({ shipping_method_pattern: "Outside Dhaka", match_type: "contains", courier_config_id: pathao.id, priority: next.length + 1, enabled: true });
    if (next.length) setRules(next);
    else setStatusMsg("Connect REDX and/or Pathao first, then add routing rules.");
  }

  function updateRule(index: number, patch: Partial<RoutingRule>) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index).map((rule, i) => ({ ...rule, priority: i + 1 })));
  }

  async function saveRoutingSettings() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shops/${shopId}/shipping-routing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redispatch_enabled: redispatchEnabled,
          shipping_method_routing_enabled: routingEnabled,
          rules: rules.map((rule, index) => ({ ...rule, priority: index + 1 }))
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to save routing settings.");
      setRules((current) => current.map((rule, index) => ({ ...rule, priority: index + 1 })));
      setStatusMsg("Redispatch and shipping routing settings saved.");
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-900">Automatic Courier Selection</p>
            <p className="text-sm text-slate-500">Automatically select the correct connected courier when dispatching.</p>
          </div>
          <Button onClick={toggleAutomatic} disabled={busy} variant={automatic ? "primary" : "secondary"}>
            {busy && <Loader2 size={14} className="mr-2 animate-spin" />}
            {automatic ? "ON" : "OFF"}
          </Button>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-slate-700">Courier Priority</p>
          {enabledConfigs.length === 0 ? (
            <p className="text-sm text-slate-500">No couriers are currently enabled. Enable them in Courier Services first.</p>
          ) : (
            <div className="space-y-2">
              {enabledConfigs.map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{idx + 1}</div>
                    <span className="font-medium text-slate-900">{c.couriers.display_name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => movePriority(idx, "up")} disabled={idx === 0 || busy} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30"><ArrowUp size={16} /></button>
                    <button onClick={() => movePriority(idx, "down")} disabled={idx === enabledConfigs.length - 1 || busy} className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30"><ArrowDown size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700"><RotateCcw size={18} /></div>
            <div>
              <p className="font-semibold text-slate-900">One-click Redispatch</p>
              <p className="text-sm text-slate-500">Allow failed or skipped orders to be sent again without manually restoring them first.</p>
            </div>
          </div>
          <Button
            onClick={() => setRedispatchEnabled((value) => !value)}
            disabled={loadingRouting || busy}
            variant={redispatchEnabled ? "primary" : "secondary"}
          >
            {redispatchEnabled ? "ON" : "OFF"}
          </Button>
        </div>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Redispatch reuses the existing dispatch record, creates a new idempotency key, records an audit event, and re-runs courier selection.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700"><Route size={18} /></div>
            <div>
              <p className="font-semibold text-slate-900">Shopify Shipping Method Routing</p>
              <p className="text-sm text-slate-500">Choose the courier from the shipping method selected by the customer in Shopify.</p>
            </div>
          </div>
          <Button
            onClick={() => setRoutingEnabled((value) => !value)}
            disabled={loadingRouting || busy}
            variant={routingEnabled ? "primary" : "secondary"}
          >
            {routingEnabled ? "ON" : "OFF"}
          </Button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <strong>Recommended Bangladesh setup:</strong> Shopify method containing <b>Inside Dhaka</b> → REDX; method containing <b>Outside Dhaka</b> → Pathao. If no rule matches, the highest-priority connected courier is used.
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={addCommonBangladeshRules} disabled={loadingRouting || busy}>Use common BD defaults</Button>
          <Button variant="secondary" onClick={() => addRule()} disabled={loadingRouting || busy}><Plus size={14} className="mr-1" /> Add rule</Button>
        </div>

        <div className="mt-4 space-y-2">
          {loadingRouting ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500"><Loader2 size={16} className="mr-2 animate-spin" />Loading routing rules…</div>
          ) : rules.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No routing rules yet. Add a rule or use the common Bangladesh defaults.</p>
          ) : rules.map((rule, index) => (
            <div key={rule.id || `new-${index}`} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_120px_180px_36px] md:items-center">
              <input
                value={rule.shipping_method_pattern}
                onChange={(e) => updateRule(index, { shipping_method_pattern: e.target.value })}
                placeholder="e.g. Inside Dhaka"
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400"
              />
              <select value={rule.match_type} onChange={(e) => updateRule(index, { match_type: e.target.value as "exact" | "contains" })} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm">
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
              </select>
              <select value={rule.courier_config_id} onChange={(e) => updateRule(index, { courier_config_id: e.target.value })} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm">
                <option value="">Select courier</option>
                {enabledConfigs.map((c) => <option key={c.id} value={c.id}>{c.couriers.display_name}</option>)}
              </select>
              <button onClick={() => removeRule(index)} disabled={busy} className="flex h-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Remove rule"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {statusMsg ? <p className="text-sm text-sky-700">{statusMsg}</p> : <span />}
          <Button onClick={saveRoutingSettings} disabled={loadingRouting || busy}>
            {busy && <Loader2 size={14} className="mr-2 animate-spin" />}
            Save Routing Settings
          </Button>
        </div>
      </div>
    </div>
  );
}

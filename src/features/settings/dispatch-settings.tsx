"use client";

import { useState, useEffect } from "react";
import { 
  Loader2, 
  ArrowUp, 
  ArrowDown, 
  Truck, 
  MapPin, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Check, 
  Sparkles, 
  Info,
  Sliders,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShippingRoutingRule, RedispatchSettings } from "@/services/courier/routing";
import { cn } from "@/lib/utils";

type CourierConfig = {
  id: string;
  enabled: boolean;
  priority: number;
  connection_status?: string;
  couriers: { display_name: string; provider: "redx" | "pathao" | "steadfast" };
};

type PickupLocation = {
  id: string;
  courierLocationId: string;
  name: string;
  address?: string;
  area?: string;
  phone?: string;
  isDefault?: boolean;
};

type CourierPickupInfo = {
  courierName: string;
  provider: string;
  locations: PickupLocation[];
  defaultLocationId?: string;
  supported?: boolean;
};

export function DispatchSettings({
  shopId,
  initialAutomatic,
  initialShippingRules = [],
  initialRedispatchSettings = {
    auto_restore: true,
    use_shipping_rules: true,
    one_click_instant: true
  },
  configs
}: {
  shopId: string;
  initialAutomatic: boolean;
  initialShippingRules?: ShippingRoutingRule[];
  initialRedispatchSettings?: RedispatchSettings;
  configs: CourierConfig[];
}) {
  const [automatic, setAutomatic] = useState(initialAutomatic);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Enabled courier configs
  const enabledConfigs = configs.filter((c) => c.enabled);
  const [orderedConfigs, setOrderedConfigs] = useState(
    [...enabledConfigs].sort((a, b) => a.priority - b.priority)
  );

  // Pickup locations map (key: courierConfigId)
  const [pickupLocationsMap, setPickupLocationsMap] = useState<Record<string, CourierPickupInfo>>({});
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Shipping routing rules state
  const [rules, setRules] = useState<ShippingRoutingRule[]>(() => {
    if (initialShippingRules && initialShippingRules.length > 0) {
      return initialShippingRules;
    }
    // Default Inside Dhaka & Outside Dhaka rules if none configured
    const firstCourier = enabledConfigs[0]?.id || "";
    const secondCourier = enabledConfigs[1]?.id || enabledConfigs[0]?.id || "";
    return [
      {
        id: "rule_inside_dhaka",
        name: "Inside Dhaka Delivery",
        zoneType: "inside_dhaka",
        methodPattern: "Inside Dhaka",
        courierConfigId: firstCourier,
        enabled: true,
        priority: 1
      },
      {
        id: "rule_outside_dhaka",
        name: "Outside Dhaka Delivery",
        zoneType: "outside_dhaka",
        methodPattern: "Outside Dhaka",
        courierConfigId: secondCourier,
        enabled: true,
        priority: 2
      }
    ];
  });

  // Redispatch settings state
  const [redispatchSettings, setRedispatchSettings] = useState<RedispatchSettings>(
    initialRedispatchSettings || {
      auto_restore: true,
      use_shipping_rules: true,
      one_click_instant: true
    }
  );

  // Fetch pickup locations for enabled couriers
  useEffect(() => {
    let mounted = true;
    async function fetchLocations() {
      try {
        const res = await fetch(`/api/shops/${shopId}/pickup-locations`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.data) {
            setPickupLocationsMap(data.data);
          }
        }
      } catch (err) {
        console.warn("Failed to load pickup locations", err);
      } finally {
        if (mounted) setLoadingLocations(false);
      }
    }
    fetchLocations();
    return () => {
      mounted = false;
    };
  }, [shopId]);

  // Save all dispatch and routing settings
  async function saveAllSettings() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shops/${shopId}/dispatch-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automatic_courier: automatic,
          shipping_rules: rules,
          redispatch_settings: redispatchSettings
        })
      });
      if (res.ok) {
        setStatusMsg({ text: "Dispatch & Shipping Routing settings saved successfully.", type: "success" });
        setTimeout(() => setStatusMsg(null), 4000);
      } else {
        const data = await res.json();
        setStatusMsg({ text: data.error || "Failed to save settings.", type: "error" });
      }
    } catch {
      setStatusMsg({ text: "Network error while saving settings.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  // Preset quick apply
  function applyPreset(insideProvider: string, outsideProvider: string) {
    const insideConfig = enabledConfigs.find((c) => c.couriers.provider === insideProvider) || enabledConfigs[0];
    const outsideConfig = enabledConfigs.find((c) => c.couriers.provider === outsideProvider) || enabledConfigs[1] || enabledConfigs[0];

    if (!insideConfig || !outsideConfig) return;

    setRules([
      {
        id: "rule_inside_dhaka",
        name: "Inside Dhaka Delivery",
        zoneType: "inside_dhaka",
        methodPattern: "Inside Dhaka",
        courierConfigId: insideConfig.id,
        courierProvider: insideConfig.couriers.provider,
        enabled: true,
        priority: 1
      },
      {
        id: "rule_outside_dhaka",
        name: "Outside Dhaka Delivery",
        zoneType: "outside_dhaka",
        methodPattern: "Outside Dhaka",
        courierConfigId: outsideConfig.id,
        courierProvider: outsideConfig.couriers.provider,
        enabled: true,
        priority: 2
      }
    ]);
  }

  // Update a specific rule
  function updateRule(index: number, updates: Partial<ShippingRoutingRule>) {
    const next = [...rules];
    next[index] = { ...next[index], ...updates };
    setRules(next);
  }

  // Add custom shipping rule
  function addCustomRule() {
    const defaultCourier = enabledConfigs[0]?.id || "";
    const newRule: ShippingRoutingRule = {
      id: `rule_custom_${Date.now()}`,
      name: "Custom Shipping Method",
      zoneType: "custom_method",
      methodPattern: "",
      courierConfigId: defaultCourier,
      enabled: true,
      priority: rules.length + 1
    };
    setRules([...rules, newRule]);
  }

  // Delete custom rule
  function deleteRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
  }

  async function movePriority(index: number, direction: "up" | "down") {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === orderedConfigs.length - 1) return;

    const newConfigs = [...orderedConfigs];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    
    // Swap
    const temp = newConfigs[index];
    newConfigs[index] = newConfigs[targetIndex];
    newConfigs[targetIndex] = temp;
    
    setOrderedConfigs(newConfigs);
    setBusy(true);

    try {
      await Promise.all(
        newConfigs.map((c, i) =>
          fetch(`/api/couriers/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: i + 1 })
          })
        )
      );
      setStatusMsg({ text: "Courier priorities updated.", type: "success" });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch {
      setStatusMsg({ text: "Network error saving priority.", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── SECTION 1: SHIPPING METHOD & ZONE COURIER ROUTING ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <MapPin size={16} />
              </span>
              <h3 className="font-bold text-slate-900 text-base">Shipping Method & Zone Courier Routing</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Automatically assign different couriers based on Shopify shipping methods (e.g. <strong>Inside Dhaka → REDX</strong>, <strong>Outside Dhaka → Pathao</strong>).
            </p>
          </div>

          <Button 
            onClick={saveAllSettings} 
            disabled={busy} 
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-8.5 px-4 shadow-2xs"
          >
            {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />}
            Save Routing Rules
          </Button>
        </div>

        {/* Quick Presets */}
        {enabledConfigs.length > 1 && (
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-500" />
              Quick Setup Presets
            </span>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => applyPreset("redx", "pathao")}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Inside: <strong>REDX</strong></span>
                <span className="text-slate-300">|</span>
                <span>Outside: <strong>Pathao</strong></span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset("pathao", "steadfast")}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Inside: <strong>Pathao</strong></span>
                <span className="text-slate-300">|</span>
                <span>Outside: <strong>Steadfast</strong></span>
              </button>
              <button
                type="button"
                onClick={() => applyPreset("redx", "steadfast")}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Inside: <strong>REDX</strong></span>
                <span className="text-slate-300">|</span>
                <span>Outside: <strong>Steadfast</strong></span>
              </button>
            </div>
          </div>
        )}

        {/* Rules Editor */}
        {enabledConfigs.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800">
            No courier services are enabled yet. Please go to the <strong>Courier Services</strong> tab to connect and enable at least one courier.
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule, idx) => {
              const locations = pickupLocationsMap[rule.courierConfigId]?.locations || [];
              const isZoneRule = rule.zoneType === "inside_dhaka" || rule.zoneType === "outside_dhaka";

              return (
                <div 
                  key={rule.id || idx}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 transition-all hover:border-slate-300 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "size-2.5 rounded-full",
                        rule.zoneType === "inside_dhaka" ? "bg-blue-500" :
                        rule.zoneType === "outside_dhaka" ? "bg-emerald-500" : "bg-purple-500"
                      )} />
                      <span className="font-bold text-slate-900 text-xs">{rule.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateRule(idx, { enabled: e.target.checked })}
                          className="size-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                        />
                        <span>Active</span>
                      </label>
                      {!isZoneRule && (
                        <button
                          type="button"
                          onClick={() => deleteRule(idx)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Condition / Pattern */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        {isZoneRule ? "Destination Zone" : "Matching Shipping Rate Title"}
                      </label>
                      {isZoneRule ? (
                        <div className="h-8.5 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-xs font-semibold text-slate-700">
                          {rule.zoneType === "inside_dhaka" ? "📍 Inside Dhaka City" : "📍 Outside Dhaka (All Districts)"}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={rule.methodPattern || ""}
                          onChange={(e) => updateRule(idx, { methodPattern: e.target.value })}
                          placeholder="e.g. Express, Sub Dhaka, 24 Hours"
                          className="w-full h-8.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        />
                      )}
                    </div>

                    {/* Assigned Courier */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Assigned Courier Service
                      </label>
                      <select
                        value={rule.courierConfigId}
                        onChange={(e) => {
                          const configId = e.target.value;
                          const defaultLoc = pickupLocationsMap[configId]?.defaultLocationId || pickupLocationsMap[configId]?.locations?.[0]?.id;
                          updateRule(idx, { courierConfigId: configId, pickupLocationId: defaultLoc });
                        }}
                        className="w-full h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        {enabledConfigs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.couriers.display_name} ({c.couriers.provider.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Pickup Location */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Pickup Location / Hub
                      </label>
                      {loadingLocations ? (
                        <div className="h-8.5 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-xs text-slate-400">
                          Loading pickup hubs…
                        </div>
                      ) : locations.length > 0 ? (
                        <select
                          value={rule.pickupLocationId || ""}
                          onChange={(e) => updateRule(idx, { pickupLocationId: e.target.value })}
                          className="w-full h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                        >
                          <option value="">Default Location</option>
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name} {loc.area ? `(${loc.area})` : ""} {loc.isDefault ? "★" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="h-8.5 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-xs text-slate-500">
                          Managed by courier account
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addCustomRule}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Custom Shipping Method Rule</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── SECTION 2: ONE-CLICK REDISPATCH SETTINGS ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <RotateCcw size={16} />
          </span>
          <div>
            <h3 className="font-bold text-slate-900 text-base">Redispatch Configuration</h3>
            <p className="text-xs text-slate-500">
              Configure one-click redispatch behavior when recovering skipped or failed orders.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {/* Setting 1: One-Click Instant Redispatch */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-900">One-Click Instant Redispatch</p>
              <p className="text-slate-500 mt-0.5">
                Instantly dispatch with 1-click directly from the orders list without opening a confirmation dialog.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRedispatchSettings(s => ({ ...s, one_click_instant: !s.one_click_instant }))}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                redispatchSettings.one_click_instant ? "bg-slate-900" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  redispatchSettings.one_click_instant ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Setting 2: Auto-Restore Skipped Orders */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-900">Auto-Restore Skipped Orders on Redispatch</p>
              <p className="text-slate-500 mt-0.5">
                Automatically un-skips skipped orders and clears prior error states when clicking Redispatch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRedispatchSettings(s => ({ ...s, auto_restore: !s.auto_restore }))}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                redispatchSettings.auto_restore ? "bg-slate-900" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  redispatchSettings.auto_restore ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Setting 3: Use Shipping Rules on Redispatch */}
          <div className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-bold text-slate-900">Apply Shipping Routing Rules on Redispatch</p>
              <p className="text-slate-500 mt-0.5">
                Automatically route to the correct courier (e.g. Inside Dhaka → RedX, Outside Dhaka → Pathao) during redispatch.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRedispatchSettings(s => ({ ...s, use_shipping_rules: !s.use_shipping_rules }))}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                redispatchSettings.use_shipping_rules ? "bg-slate-900" : "bg-slate-200"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  redispatchSettings.use_shipping_rules ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            onClick={saveAllSettings}
            disabled={busy}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold h-8.5 px-4"
          >
            {busy && <Loader2 size={13} className="mr-1.5 animate-spin" />}
            Save Redispatch Settings
          </Button>
        </div>
      </div>

      {/* ─── SECTION 3: AUTOMATIC COURIER & FALLBACK PRIORITY ─── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-slate-900 text-sm">Automatic Courier Selection</p>
            <p className="text-xs text-slate-500">Automatically select the highest priority enabled courier when manual selection is omitted.</p>
          </div>
          <Button 
            onClick={() => {
              setAutomatic(!automatic);
            }} 
            disabled={busy} 
            variant={automatic ? "primary" : "secondary"}
            className="text-xs h-8"
          >
            {automatic ? "ENABLED" : "DISABLED"}
          </Button>
        </div>

        <div className="mt-4">
          <p className="mb-2.5 text-xs font-bold text-slate-700">Fallback Courier Priority</p>
          {orderedConfigs.length === 0 ? (
            <p className="text-xs text-slate-500">No couriers are currently enabled. Enable them in Courier Services first.</p>
          ) : (
            <div className="space-y-2">
              {orderedConfigs.map((c, idx) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-5.5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {idx + 1}
                    </div>
                    <span className="font-semibold text-xs text-slate-900">{c.couriers.display_name}</span>
                    <span className="text-[10px] uppercase font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                      {c.couriers.provider}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => movePriority(idx, "up")} 
                      disabled={idx === 0 || busy}
                      className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                      title="Move up"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button 
                      onClick={() => movePriority(idx, "down")} 
                      disabled={idx === orderedConfigs.length - 1 || busy}
                      className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                      title="Move down"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Notification status message */}
      {statusMsg && (
        <div className={cn(
          "rounded-xl p-3.5 text-xs font-medium flex items-center gap-2 border animate-in fade-in",
          statusMsg.type === "success" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
        )}>
          {statusMsg.type === "success" ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" /> : <Info size={15} className="text-red-600 shrink-0" />}
          <span>{statusMsg.text}</span>
        </div>
      )}
    </div>
  );
}

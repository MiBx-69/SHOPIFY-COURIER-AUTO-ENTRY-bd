"use client";

import { useState } from "react";
import { 
  Loader2, 
  RotateCcw, 
  Info,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
type RedispatchSettings = { auto_restore: boolean; one_click_instant: boolean; };
import { cn } from "@/lib/utils";

type CourierConfig = {
  id: string;
  enabled: boolean;
  priority: number;
  connection_status?: string;
  couriers: { display_name: string; provider: "redx" | "pathao" | "steadfast" };
};

export function DispatchSettings({
  shopId,
  initialAutomatic,
  initialRedispatchSettings = {
    auto_restore: true,
    one_click_instant: true
  },
  configs
}: {
  shopId: string;
  initialAutomatic: boolean;
  initialRedispatchSettings?: RedispatchSettings;
  configs: CourierConfig[];
}) {
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Redispatch settings state
  const [redispatchSettings, setRedispatchSettings] = useState<RedispatchSettings>(
    initialRedispatchSettings || {
      auto_restore: true,
      one_click_instant: true
    }
  );

  // Save all dispatch settings
  async function saveAllSettings() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shops/${shopId}/dispatch-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redispatch_settings: redispatchSettings
        })
      });
      if (res.ok) {
        setStatusMsg({ text: "Dispatch settings saved successfully.", type: "success" });
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

  return (
    <div className="space-y-6">
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
              onClick={() => setRedispatchSettings((s: RedispatchSettings) => ({ ...s, one_click_instant: !s.one_click_instant }))}
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
              onClick={() => setRedispatchSettings((s: RedispatchSettings) => ({ ...s, auto_restore: !s.auto_restore }))}
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

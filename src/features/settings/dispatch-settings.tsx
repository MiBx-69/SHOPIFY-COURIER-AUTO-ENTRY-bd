"use client";
import { useState } from "react";
import { Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type CourierConfig = {
  id: string;
  enabled: boolean;
  priority: number;
  couriers: { display_name: string; provider: string };
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
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Only show enabled couriers for priority sorting
  const [orderedConfigs, setOrderedConfigs] = useState(
    [...configs].filter(c => c.enabled).sort((a, b) => a.priority - b.priority)
  );

  async function toggleAutomatic() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/shops/${shopId}/dispatch-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automatic_courier: !automatic })
      });
      if (res.ok) {
        setAutomatic(!automatic);
        setStatusMsg(`Automatic courier selection is now ${!automatic ? "ON" : "OFF"}.`);
      } else {
        setStatusMsg("Failed to update setting.");
      }
    } catch {
      setStatusMsg("Network error.");
    }
    setBusy(false);
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
    } catch {
      setStatusMsg("Network error saving priority.");
    }
    setBusy(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold text-slate-900">Automatic Courier Selection</p>
          <p className="text-sm text-slate-500">Automatically select the highest priority enabled courier when dispatching.</p>
        </div>
        <Button onClick={toggleAutomatic} disabled={busy} variant={automatic ? "primary" : "secondary"}>
          {busy && <Loader2 size={14} className="mr-2 animate-spin" />}
          {automatic ? "ON" : "OFF"}
        </Button>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-slate-700">Courier Priority</p>
        {orderedConfigs.length === 0 ? (
          <p className="text-sm text-slate-500">No couriers are currently enabled. Enable them in Courier Services first.</p>
        ) : (
          <div className="space-y-2">
            {orderedConfigs.map((c, idx) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                    {idx + 1}
                  </div>
                  <span className="font-medium text-slate-900">{c.couriers.display_name}</span>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => movePriority(idx, "up")} 
                    disabled={idx === 0 || busy}
                    className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button 
                    onClick={() => movePriority(idx, "down")} 
                    disabled={idx === orderedConfigs.length - 1 || busy}
                    className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {statusMsg && <p className="mt-4 text-sm text-sky-700">{statusMsg}</p>}
    </div>
  );
}

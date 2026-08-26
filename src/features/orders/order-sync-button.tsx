"use client";

import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function OrderSyncButton({ shopId }: { shopId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSync() {
    setBusy(true);
    try {
      const res = await fetch(`/api/shopify/sync?shopId=${encodeURIComponent(shopId)}`, {
        method: "POST"
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to sync order.");
      }
    } catch {
      alert("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button 
      variant="secondary" 
      onClick={handleSync} 
      disabled={busy}
      className="h-7 text-[11px] gap-1 px-2.5 ml-auto sm:ml-0"
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin text-slate-500" />
      ) : (
        <RefreshCw size={12} className="text-slate-500" />
      )}
      <span>Sync from Shopify</span>
    </Button>
  );
}

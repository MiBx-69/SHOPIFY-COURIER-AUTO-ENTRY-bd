"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShopifyConnect() {
  const [shop, setShop] = useState("");
  const [error, setError] = useState<string>();

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const normalized = shop.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/.test(normalized)) {
      setError("Enter your permanent .myshopify.com store domain.");
      return;
    }
    // Shopify OAuth install is an external destination — a full navigation is required.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/shopify/install?shop=${encodeURIComponent(normalized)}`);
  }

  return (
    <form onSubmit={connect} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        value={shop}
        onChange={(event) => setShop(event.target.value)}
        placeholder="your-store.myshopify.com"
        aria-label="Shopify store domain"
        className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
      />
      <Button>Connect Shopify</Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

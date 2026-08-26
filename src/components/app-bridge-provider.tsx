"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function AppBridgeProvider() {
  const searchParams = useSearchParams();
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    const embeddedParam = searchParams.get("embedded") === "1";
    const inIframe = window.top !== window.self;
    if (embeddedParam || inIframe) {
      setIsEmbedded(true);
    }
  }, [searchParams]);

  if (!isEmbedded) return null;

  // We need to provide the shop API key or host. But App Bridge v4 automatically infers host from URL params.
  return (
    <Script 
      src="https://cdn.shopify.com/shopifycloud/app-bridge.js" 
      strategy="afterInteractive" 
    />
  );
}

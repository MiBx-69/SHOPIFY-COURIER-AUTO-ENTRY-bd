"use client";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

export function AppBridgeProvider() {
  const searchParams = useSearchParams();
  const embeddedParam = searchParams.get("embedded") === "1";
  const inIframe = typeof window !== "undefined" && window.top !== window.self;

  if (!embeddedParam && !inIframe) return null;

  // App Bridge v4 automatically infers host and client from URL params.
  return (
    <Script 
      src="https://cdn.shopify.com/shopifycloud/app-bridge.js" 
      strategy="afterInteractive" 
    />
  );
}

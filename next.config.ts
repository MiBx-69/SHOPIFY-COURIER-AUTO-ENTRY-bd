import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// 'unsafe-eval' is needed by React in development mode for devtools/stack reconstruction.
// It is NOT included in production. See: https://react.dev/reference/react/eval
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// frame-ancestors controls which origins can embed this app.
// Shopify Admin embeds the app via iframe — both admin.shopify.com and *.myshopify.com must be allowed.
// X-Frame-Options is intentionally omitted because it conflicts with CSP frame-ancestors.
const frameAncestors = "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  // wss: required for Supabase Realtime WebSocket connections
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.myshopify.com",
  frameAncestors,
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  headers: async () => [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: csp }
    ]
  }]
};
export default nextConfig;

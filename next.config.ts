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
  // data: for inline product images, https: for Shopify CDN images and Telegram API
  "img-src 'self' data: https:",
  // wss: required for Supabase Realtime WebSocket connections
  // api.telegram.org required for Telegram bot alert delivery (server-side fetch, but kept for safety)
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.myshopify.com https://api.telegram.org",
  frameAncestors,
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

const nextConfig: NextConfig = {
  // Vercel handles its own serverless bundling; forcing standalone breaks its trace generator
  output: process.env.VERCEL ? undefined : "standalone",
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  headers: async () => [{
    source: "/(.*)",
    headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: csp },
      // HSTS: force HTTPS for 1 year including subdomains (production only)
      // Do not set this in development — it would break local http:// access
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : [])
    ]
  }]
};
export default nextConfig;

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
      // HSTS: force HTTPS for 1 year including subdomains (production only)
      // Do not set this in development — it would break local http:// access
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : [])
    ]
  }]
};
export default nextConfig;

import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name: "Dispatch", short_name: "Dispatch", description: "Shopify courier dispatch", start_url: "/", display: "standalone", background_color: "#f8fafc", theme_color: "#0f172a", icons: [] }; }

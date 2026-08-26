import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Dispatch", description: "Shopify multi-courier dispatch terminal", applicationName: "Dispatch", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "Dispatch" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

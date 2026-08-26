import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppBridgeProvider } from "@/components/app-bridge-provider";
export const metadata: Metadata = { title: "Dispatch", description: "Shopify multi-courier dispatch terminal", applicationName: "Dispatch", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "Dispatch" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Suspense fallback={null}><AppBridgeProvider /></Suspense>{children}</body></html>; }
